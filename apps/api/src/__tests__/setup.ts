/**
 * Test Setup
 *
 * Global test configuration and database setup for API tests.
 */

// Load test environment variables from .env.test
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.test') });

// Mock @supabase/supabase-js BEFORE any imports that use it
// This ensures the middleware uses the mocked client instead of the real one
const useRealSupabase = process.env.TEST_REAL_SUPABASE === 'true';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - jest global is available at runtime
if (!useRealSupabase) {
  const getUserForToken = (token: string) => {
    if (token === 'support-jwt-token') {
      return {
        id: 'support-uuid',
        email: 'support@test.com',
        app_metadata: {
          tenantId: 'default',
        },
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      };
    }

    if (token === 'invited-tenant-admin-jwt-token') {
      return {
        id: 'invited-tenant-admin-uuid',
        email: 'invited-admin@test.com',
        app_metadata: {},
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      };
    }

    if (token === 'expired-invite-jwt-token') {
      return null;
    }

    return {
      id: 'test-admin-uuid',
      email: 'admin@test.com',
      app_metadata: {
        tenantId: 'default',
      },
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
    };
  };

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - jest global is available at runtime
  jest.mock('@supabase/supabase-js', () => ({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - jest global is available at runtime
    createClient: jest.fn(() => ({
      auth: {
        admin: {
          inviteUserByEmail: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
          updateUserById: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        },
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - jest global is available at runtime
        getUser: jest.fn((token: string) => {
          const user = getUserForToken(token);

          if (!user) {
            return Promise.resolve({
              data: { user: null },
              error: { message: 'Invalid token' },
            });
          }

          return Promise.resolve({
            data: { user },
            error: null,
          });
        }),
      },
    })),
  }));
}

import { prisma } from '../lib/prisma';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Jest globals are available at runtime
beforeAll(async () => {
  // Database connection is established by Prisma singleton
  // Add any global setup here if needed
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Jest globals are available at runtime
afterAll(async () => {
  // Cleanup database after all tests
  await prisma.$disconnect();
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Jest globals are available at runtime
beforeEach(async () => {
  // No global cleanup - rely on tenant-scoped cleanup in test helpers
  // This prevents parallel Jest worker interference
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Jest globals are available at runtime
afterEach(async () => {
  // Ensure cleanup runs even if tests fail
  // This is a safety net for any test that doesn't properly clean up
  try {
    // Log any failed tests for debugging
    // Note: Individual test cleanup should be handled in test helpers
  } catch (error) {
    console.warn('Test cleanup warning:', error);
  }
});
