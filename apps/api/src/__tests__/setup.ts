/**
 * Test Setup
 *
 * Global test configuration and database setup for API tests.
 */

// Load test environment variables from .env.test
import { config } from 'dotenv';
config({ path: '../../.env.test' });

// Mock @supabase/supabase-js BEFORE any imports that use it
// This ensures the middleware uses the mocked client instead of the real one
const useRealSupabase = process.env.TEST_REAL_SUPABASE === 'true';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - jest global is available at runtime
if (!useRealSupabase) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - jest global is available at runtime
  jest.mock('@supabase/supabase-js', () => ({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - jest global is available at runtime
    createClient: jest.fn(() => ({
      auth: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - jest global is available at runtime
        getUser: jest.fn(() => Promise.resolve({
          data: {
            user: {
              id: 'test-admin-uuid',
              email: 'admin@test.com',
              app_metadata: {
                tenantId: 'default',
              },
            },
          },
          error: null,
        })),
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
