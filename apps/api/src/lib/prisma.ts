import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton
 * 
 * Prevents connection pool exhaustion by reusing a single instance.
 * All database operations must use this instance.
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : 
          process.env.NODE_ENV === 'test' ? ['warn'] : ['error'],
  });

globalForPrisma.prisma = prisma;
