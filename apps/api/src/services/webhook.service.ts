import { prisma } from '../lib/prisma';
import { createHmac } from 'crypto';

/**
 * Webhook Service
 * 
 * Handles publishing of wallet events, signing payloads using HMAC-SHA256,
 * and dispatching notifications asynchronously with exponential backoff retries.
 */

interface WebhookEventPayload {
  event: string;
  tenant_id: string;
  timestamp: string;
  data: Record<string, any>;
}



/**
 * Publish a webhook event
 * Scopes active webhooks, creates deliveries, and triggers immediate async dispatch.
 */
export async function publishWebhookEvent(
  tenantId: string,
  eventType: string,
  data: Record<string, any>,
  isSandbox = false
): Promise<void> {
  try {
    // Webhook model does not currently support isSandbox flag, so we scope all webhooks within the tenant
    const webhooks = await prisma.webhook.findMany({
      where: {
        tenantId,
        isActive: true,
      },
    });

    if (webhooks.length === 0) return;

    const timestamp = new Date().toISOString();
    const eventPayload: WebhookEventPayload = {
      event: eventType,
      tenant_id: tenantId,
      timestamp,
      data,
    };

    // 2. Filter webhooks that subscribe to this event type
    const matchingWebhooks = webhooks.filter(
      (w) => w.events.includes(eventType) || w.events.includes('*')
    );

    for (const webhook of matchingWebhooks) {
      // 3. Create WebhookDelivery record
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload: eventPayload as any,
          attemptNum: 1,
        },
      });

      // 4. Trigger immediate out-of-band asynchronous delivery
      // We run this inside a Promise block with catch to avoid blocking the main execution path.
      dispatchWebhookDelivery(delivery.id).catch((err) => {
        if (process.env.NODE_ENV !== 'test') {
          console.error(`Failed immediate dispatch of webhook delivery ${delivery.id}:`, err);
        }
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error publishing webhook event:', error);
    }
  }
}

/**
 * Get backoff delay in seconds based on attempt number
 * Backoffs:
 * - Attempt 2: 30 seconds
 * - Attempt 3: 2 minutes
 * - Attempt 4: 15 minutes
 * - Attempt 5: 2 hours
 */
function getBackoffDelaySeconds(attemptNum: number): number {
  switch (attemptNum) {
    case 2:
      return 30;
    case 3:
      return 120;
    case 4:
      return 900;
    case 5:
      return 7200;
    default:
      return 0;
  }
}

/**
 * Dispatches a specific webhook delivery over HTTP POST.
 * Updates delivery logs and handles backoff scheduling on failure.
 */
export async function dispatchWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery || !delivery.webhook || !delivery.webhook.isActive) {
    return;
  }

  const startTime = Date.now();
  let statusCode: number | null = null;
  let responseText = '';
  let delivered = false;

  try {
    const serialized = typeof delivery.payload === 'string'
      ? delivery.payload
      : JSON.stringify(delivery.payload);
    const hmac = createHmac('sha256', delivery.webhook.secret);
    hmac.update(serialized);
    const signature = `sha256=${hmac.digest('hex')}`;

    // Call external HTTP endpoint using Node.js native fetch
    const response = await fetch(delivery.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WalletOS-Signature': signature,
        'X-Tenant-ID': delivery.webhook.tenantId,
        'User-Agent': 'WalletOS-Webhook-Dispatcher/1.0',
      },
      body: JSON.stringify(delivery.payload),
      // Set a strict timeout to prevent hung requests
      signal: AbortSignal.timeout(10000),
    });

    statusCode = response.status;
    responseText = await response.text();
    delivered = response.ok; // true for 200-299 status codes
  } catch (error: any) {
    responseText = error instanceof Error ? error.message : String(error);
    if (error.name === 'TimeoutError') {
      statusCode = 408;
    }
  }

  const latency = Date.now() - startTime;

  // Wrap related updates in a single transaction
  await prisma.$transaction(async (tx) => {
    // 1. Update delivery entry
    await tx.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode,
        response: responseText.slice(0, 1000), // Cap response length to fit in DB
        deliveredAt: delivered ? new Date() : null,
      },
    });

    // 2. Update webhook metrics and handle retry logic
    if (delivered) {
      await tx.webhook.update({
        where: { id: delivery.webhookId },
        data: {
          lastAttempt: new Date(),
          failureCount: 0,
          status: 'active',
        },
      });
    } else {
      const nextAttemptNum = delivery.attemptNum + 1;

      if (nextAttemptNum <= 5) {
        const delaySeconds = getBackoffDelaySeconds(nextAttemptNum);
        const nextAttempt = new Date(Date.now() + delaySeconds * 1000);

        // Update delivery for next attempt
        await tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            attemptNum: nextAttemptNum,
            nextAttempt,
          },
        });

        // Update Webhook failure counts
        await tx.webhook.update({
          where: { id: delivery.webhookId },
          data: {
            lastAttempt: new Date(),
            failureCount: { increment: 1 },
          },
        });
      } else {
        // Exceeded max retries - mark delivery as failed (dead-letter queue)
        await tx.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            nextAttempt: null, // Stop retrying
          },
        });

        // Mark webhook as failed if failures keep compiling
        await tx.webhook.update({
          where: { id: delivery.webhookId },
          data: {
            lastAttempt: new Date(),
            failureCount: { increment: 1 },
            status: 'failed',
          },
        });
      }
    }
  });
}

/**
 * Lightweight helper to limit parallel executions of async tasks
 */
async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    executing.add(p);
    p.then(() => executing.delete(p));
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * Background retry worker
 * Periodically sweeps the database for pending webhook retries.
 */
let workerIntervalId: NodeJS.Timeout | null = null;

export function startWebhookRetryWorker(intervalMs = 30000): void {
  if (workerIntervalId) return;

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[Webhook Worker] Starting background retry worker (interval: ${intervalMs}ms)`);
  }

  workerIntervalId = setInterval(async () => {
    try {
      const now = new Date();
      // Query deliveries that need retrying
      const pendingDeliveries = await prisma.webhookDelivery.findMany({
        where: {
          deliveredAt: null,
          nextAttempt: { lte: now },
          attemptNum: { lte: 5 },
        },
        select: { id: true },
      });

      if (pendingDeliveries.length > 0) {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[Webhook Worker] Found ${pendingDeliveries.length} pending webhook deliveries to retry.`);
        }

        const limit = Number(process.env.WEBHOOK_CONCURRENCY_LIMIT) || 5;
        await runWithLimit(pendingDeliveries, limit, async (delivery) => {
          // Atomic claim: lease the delivery to push nextAttempt forward to prevent concurrent processing
          const leaseTime = new Date(Date.now() + 120 * 1000);
          try {
            const isClaimed = await prisma.$transaction(async (tx) => {
              const current = await tx.webhookDelivery.findUnique({
                where: { id: delivery.id },
                select: { id: true, deliveredAt: true, nextAttempt: true },
              });

              if (!current || current.deliveredAt !== null || !current.nextAttempt || current.nextAttempt > now) {
                return false;
              }

              await tx.webhookDelivery.update({
                where: { id: delivery.id },
                data: { nextAttempt: leaseTime },
              });

              return true;
            });

            if (!isClaimed) {
              return;
            }

            await dispatchWebhookDelivery(delivery.id).catch((err) => {
              if (process.env.NODE_ENV !== 'test') {
                console.error(`[Webhook Worker] Retry failed for delivery ${delivery.id}:`, err);
              }
            });
          } catch (err) {
            if (process.env.NODE_ENV !== 'test') {
              console.error(`[Webhook Worker] Lock/lease transaction failed for delivery ${delivery.id}:`, err);
            }
          }
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[Webhook Worker] Error sweeping pending webhook retries:', error);
      }
    }
  }, intervalMs);
}
