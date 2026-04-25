/**
 * Test Setup
 * 
 * Global test configuration and database setup for API tests.
 */

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
  // Clean up test data before each test with error handling
  try {
    await prisma.auditLog.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.apiKey.deleteMany({});
    await prisma.tenant.deleteMany({});
  } catch (error) {
    // Ignore cleanup errors - database might not be available
    console.warn('Cleanup failed:', error);
  }
});
