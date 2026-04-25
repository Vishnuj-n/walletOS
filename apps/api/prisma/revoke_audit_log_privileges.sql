-- Revoke UPDATE and DELETE privileges on AuditLog table to ensure immutability
REVOKE UPDATE, DELETE ON "AuditLog" FROM postgres, public;
