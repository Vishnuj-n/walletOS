generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum KeyScope {
  read_only
  read_write
  admin
}

enum AdminRole {
  support
  finance
  superadmin
}

enum WalletStatus {
  active
  frozen
  pending_closure
  closed
}

enum TransactionType {
  credit
  debit
  reversal
}

model Tenant {
  id           String   @id @default(cuid())
  name         String
  contactEmail String?
  config       Json?    
  
  apiKeys      ApiKey[]
  adminUsers   AdminUser[]
  wallets      Wallet[]
  transactions Transaction[]
  auditLogs    AuditLog[]
  webhooks     WebhookEndpoint[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model ApiKey {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
  
  keyHash    String   // Stores SHA-256 hash
  prefix     String   
  scope      KeyScope
  isSandbox  Boolean
  isActive   Boolean  @default(true)
  
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([prefix, isActive])
}

model AdminUser {
  id            String    @id @default(cuid())
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  
  supabaseUid   String    @unique
  email         String
  role          AdminRole
  isActive      Boolean   @default(true)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Wallet {
  id               String       @id @default(cuid())
  tenantId         String
  tenant           Tenant       @relation(fields: [tenantId], references: [id])
  
  externalUserId   String
  label            String?
  balance          Decimal      @db.Decimal(20, 4) @default(0.0000)
  currency         String       @default("INR")
  status           WalletStatus @default(active)
  isSandbox        Boolean      @default(false)
  metadata         Json?
  closureScheduledAt DateTime?

  transactions     Transaction[]
  auditLogs        AuditLog[]
  sessionTokens    UserSessionToken[]

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@unique([tenantId, externalUserId, isSandbox])
}

model Transaction {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  
  walletId        String
  wallet          Wallet          @relation(fields: [walletId], references: [id])
  
  type            TransactionType
  amount          Decimal         @db.Decimal(20, 4)
  balanceBefore   Decimal         @db.Decimal(20, 4)
  balanceAfter    Decimal         @db.Decimal(20, 4)
  description     String
  referenceId     String?
  idempotencyKey  String?
  createdBy       String          
  isSandbox       Boolean         @default(false)
  metadata        Json?

  originalTxId    String?
  originalTx      Transaction?    @relation("Reversals", fields: [originalTxId], references: [id])
  reversals       Transaction[]   @relation("Reversals")

  createdAt       DateTime        @default(now())

  @@unique([tenantId, idempotencyKey])
  @@index([walletId, createdAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  
  walletId  String?
  wallet    Wallet?  @relation(fields: [walletId], references: [id])
  
  action    String
  actor     String   
  before    Json?
  after     Json?
  ipAddress String?
  
  createdAt DateTime @default(now())

  // Note: Database uses table partitioning on createdAt by month.
  @@index([walletId])
  @@index([tenantId, createdAt])
}

model UserSessionToken {
  id         String   @id @default(cuid())
  walletId   String
  wallet     Wallet   @relation(fields: [walletId], references: [id])
  
  tokenHash  String   @unique
  expiresAt  DateTime
  
  createdAt  DateTime @default(now())
}

model WebhookEndpoint {
  id         String            @id @default(cuid())
  tenantId   String
  tenant     Tenant            @relation(fields: [tenantId], references: [id])
  
  url        String
  events     String[]          
  secret     String
  isActive   Boolean           @default(true)
  status     String            @default("active") // active or degraded

  deliveries WebhookDelivery[]
  
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
}

model WebhookDelivery {
  id             String          @id @default(cuid())
  endpointId     String
  endpoint       WebhookEndpoint @relation(fields: [endpointId], references: [id])
  
  event          String
  payload        Json
  status         String          
  attemptCount   Int             @default(0)
  responseCode   Int?
  
  scheduledFor   DateTime
  succeededAt    DateTime?
  failedAt       DateTime?
  createdAt      DateTime        @default(now())
}