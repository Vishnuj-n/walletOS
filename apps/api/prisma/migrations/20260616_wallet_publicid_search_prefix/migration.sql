-- Migration: Reformat Wallet publicId to human-readable search-prefix format
-- Format: wal_{3-char tenant slug}_{8-char hex suffix}
-- This overwrites the previous SHA-256 hash-based publicId values.
-- Safe to run on existing data; WHERE clause only updates wallets that don't
-- already have the new short format (i.e., not starting with 'wal_' + 3-char slug).
-- Run on remote Supabase: 2026-06-16

WITH numbered_wallets AS (
  SELECT
    w.id,
    t.name AS tenant_name,
    row_number() OVER (ORDER BY w.id) AS rnum
  FROM "Wallet" w
  JOIN "Tenant" t ON w."tenantId" = t.id
)
UPDATE "Wallet" target
SET "publicId" = 'wal_' ||
  rpad(substring(regexp_replace(lower(src.tenant_name), '[^a-z0-9]', '', 'g') FROM 1 FOR 3), 3, 'x') ||
  '_' ||
  substring(md5(src.id) FROM 1 FOR (8 - length(to_hex(src.rnum)))) ||
  to_hex(src.rnum)
FROM numbered_wallets src
WHERE target.id = src.id;
