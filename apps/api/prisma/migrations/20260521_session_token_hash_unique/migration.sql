-- Enforce deterministic session token hash lookups and remove redundant tokenHash indexes.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "SessionToken"
		GROUP BY "tokenHash"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Duplicate SessionToken.tokenHash values detected; migration SessionToken_tokenHash_key cannot be applied safely';
	END IF;
END $$;

ALTER TABLE "SessionToken"
ADD CONSTRAINT "SessionToken_tokenHash_key" UNIQUE ("tokenHash");

DROP INDEX IF EXISTS "SessionToken_tokenHash_idx";
DROP INDEX IF EXISTS "PendingVerification_tokenHash_idx";
