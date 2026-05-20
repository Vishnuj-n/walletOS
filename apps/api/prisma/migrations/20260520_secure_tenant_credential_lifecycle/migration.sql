ALTER TABLE "AdminUser"
  ALTER COLUMN "supabaseUid" DROP NOT NULL;

ALTER TABLE "AdminUser"
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "activatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AdminUser_tenantId_email_key" ON "AdminUser"("tenantId", "email");
