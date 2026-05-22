BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public."Wallet" ADD COLUMN IF NOT EXISTS "publicId" TEXT;
UPDATE public."Wallet"
SET "publicId" = 'wal_' || encode(digest(concat_ws('|', 'wallet_public_id_v1', "tenantId", "externalUserId", "isSandbox"::text, id), 'sha256'), 'hex')
WHERE "publicId" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Wallet"
    GROUP BY "publicId"
    HAVING COUNT(*) > 1
  ) THEN
    WITH duplicate_rows AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (PARTITION BY "publicId" ORDER BY "createdAt" DESC, id DESC) AS row_num
      FROM public."Wallet"
      WHERE "publicId" IS NOT NULL
    )
    UPDATE public."Wallet" wallet
    SET "publicId" = wallet."publicId" || '_' || replace(gen_random_uuid()::text, '-', '')
    FROM duplicate_rows
    WHERE wallet.ctid = duplicate_rows.ctid
      AND duplicate_rows.row_num > 1;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Wallet"
    GROUP BY "publicId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate publicId values remain for public."Wallet" after backfill';
  END IF;
END $$;
ALTER TABLE public."Wallet" ALTER COLUMN "publicId" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Wallet_publicId_key'
  ) THEN
    ALTER TABLE public."Wallet" ADD CONSTRAINT "Wallet_publicId_key" UNIQUE ("publicId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Wallet_publicId_idx" ON public."Wallet"("publicId");

ALTER TABLE public."Transaction" ADD COLUMN IF NOT EXISTS "publicId" TEXT;
UPDATE public."Transaction"
SET "publicId" = 'txn_' || encode(digest(concat_ws('|', 'transaction_public_id_v1', "tenantId", "walletId", id), 'sha256'), 'hex')
WHERE "publicId" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Transaction"
    GROUP BY "publicId"
    HAVING COUNT(*) > 1
  ) THEN
    WITH duplicate_rows AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (PARTITION BY "publicId" ORDER BY "createdAt" DESC, id DESC) AS row_num
      FROM public."Transaction"
      WHERE "publicId" IS NOT NULL
    )
    UPDATE public."Transaction" transaction_row
    SET "publicId" = transaction_row."publicId" || '_' || replace(gen_random_uuid()::text, '-', '')
    FROM duplicate_rows
    WHERE transaction_row.ctid = duplicate_rows.ctid
      AND duplicate_rows.row_num > 1;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Transaction"
    GROUP BY "publicId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate publicId values remain for public."Transaction" after backfill';
  END IF;
END $$;
ALTER TABLE public."Transaction" ALTER COLUMN "publicId" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Transaction_publicId_key'
  ) THEN
    ALTER TABLE public."Transaction" ADD CONSTRAINT "Transaction_publicId_key" UNIQUE ("publicId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Transaction_publicId_idx" ON public."Transaction"("publicId");

ALTER TABLE public."AdminUser" ADD COLUMN IF NOT EXISTS "publicId" TEXT;
UPDATE public."AdminUser"
SET "publicId" = 'usr_' || encode(digest(concat_ws('|', 'admin_user_public_id_v1', "tenantId", email), 'sha256'), 'hex')
WHERE "publicId" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."AdminUser"
    GROUP BY "publicId"
    HAVING COUNT(*) > 1
  ) THEN
    WITH duplicate_rows AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (PARTITION BY "publicId" ORDER BY "createdAt" DESC, id DESC) AS row_num
      FROM public."AdminUser"
      WHERE "publicId" IS NOT NULL
    )
    UPDATE public."AdminUser" admin_user
    SET "publicId" = admin_user."publicId" || '_' || replace(gen_random_uuid()::text, '-', '')
    FROM duplicate_rows
    WHERE admin_user.ctid = duplicate_rows.ctid
      AND duplicate_rows.row_num > 1;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."AdminUser"
    GROUP BY "publicId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate publicId values remain for public."AdminUser" after backfill';
  END IF;
END $$;
ALTER TABLE public."AdminUser" ALTER COLUMN "publicId" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminUser_publicId_key'
  ) THEN
    ALTER TABLE public."AdminUser" ADD CONSTRAINT "AdminUser_publicId_key" UNIQUE ("publicId");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "AdminUser_publicId_idx" ON public."AdminUser"("publicId");

COMMIT;
