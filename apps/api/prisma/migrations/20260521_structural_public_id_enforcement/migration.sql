BEGIN;

ALTER TABLE public."Wallet" ADD COLUMN IF NOT EXISTS "publicId" TEXT;
UPDATE public."Wallet"
SET "publicId" = 'wal_' || LOWER(COALESCE("externalUserId", substring(id from 5 for 6)))
WHERE "publicId" IS NULL;
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
SET "publicId" = 'txn_' || substring(id from 5 for 8)
WHERE "publicId" IS NULL;
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
SET "publicId" = 'usr_' || LOWER(REPLACE(REPLACE(email, '@', '_'), '.', '_'))
WHERE "publicId" IS NULL;
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
