-- AlterTable: add allowedOrigins column to TenantConfig
-- Column was applied directly to Supabase; this migration records it for VCS tracking.
ALTER TABLE "TenantConfig" ADD COLUMN IF NOT EXISTS "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
