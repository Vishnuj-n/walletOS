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
