-- Enforce deterministic session token hash lookups and remove redundant tokenHash indexes.
ALTER TABLE "SessionToken"
ADD CONSTRAINT "SessionToken_tokenHash_key" UNIQUE ("tokenHash");

DROP INDEX IF EXISTS "SessionToken_tokenHash_idx";
DROP INDEX IF EXISTS "PendingVerification_tokenHash_idx";
