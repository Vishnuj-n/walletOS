/**
 * Transaction metadata types
 */
interface TransactionMetadata {
  description?: string;
  createdBy?: string;
  transferType?: 'source' | 'destination';
  originalTxId?: string;
  reason?: string;
  originalDescription?: string;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Transaction response from API
 */
export interface TransactionResponse {
  transaction_id: string;
  wallet_id: string;
  type: string;
  amount: string;
  balance_before: string;
  balance_after: string;
  description?: string;
  reference_id?: string;
  idempotency_key?: string;
  created_by?: string;
  is_sandbox: boolean;
  metadata: TransactionMetadata;
  created_at: string;
}



/**
 * Wallet entity
 */
export interface Wallet {
  wallet_id: string;
  external_user_id: string;
  label: string | null;
  balance: string;
  currency: string;
  status: string;
  is_sandbox: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Wallet list response with pagination
 */
export interface WalletListResponse {
  data: Wallet[];
  next_cursor?: string;
}

/**
 * Request to create a wallet
 */
export interface CreateWalletRequest {
  external_user_id: string;
  tenant_id?: string;
  currency: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a wallet
 */
export interface UpdateWalletRequest {
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to freeze a wallet
 */
export interface FreezeWalletRequest {
  reason: string;
}

/**
 * Audit log entry
 */
export interface AuditLog {
  id: string;
  tenant_id: string;
  wallet_id: string | null;
  action: string;
  actor: string;
  changes: Record<string, unknown>;
  timestamp: string;
}

/**
 * Audit log list response
 */
export interface AuditLogListResponse {
  data: AuditLog[];
  next_cursor?: string;
}

/**
 * Base transaction request fields
 */
interface TransactionRequest {
  wallet_id: string;
  amount: string;
  description: string;
  reference_id?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Credit transaction request
 */
export type CreditTransactionRequest = TransactionRequest;

/**
 * Debit transaction request
 */
export type DebitTransactionRequest = TransactionRequest;

/**
 * Reversal transaction request
 */
export interface ReversalTransactionRequest {
  reason: string;
}

/**
 * Admin role hierarchy
 */
export type AdminRole = 'support' | 'finance' | 'tenant_admin' | 'superadmin';

/**
 * Role ranking for RBAC comparisons
 */
export const roleRank: Record<AdminRole, number> = {
  support: 0,
  finance: 1,
  tenant_admin: 2,
  superadmin: 3,
};


/**
 * Current admin user record used by admin UI
 */
export interface AdminUserInfo {
  id: string;
  email: string;
  tenantId: string;
  role: AdminRole;
}

type DashboardCapabilityScope = 'tenant' | 'platform' | 'account';

export interface DashboardCapability {
  id: string;
  label: string;
  href: string;
  description: string;
  minRole: AdminRole;
  scope: DashboardCapabilityScope;
}

/**
 * /admin/me response shape proxied by admin app
 */
export interface AdminMeResponse {
  adminUser: AdminUserInfo;
}

/**
 * Tenant entity used in admin console
 */
export interface Tenant {
  tenant_id: string;
  name: string;
  contact_email: string;
  created_at: string;
  wallet_count: number;
  admin_count: number;
}

export interface TenantListResponse {
  data: Tenant[];
}

export interface RotateKeyRequest {
  scope: 'live' | 'test';
  keyScope?: 'read_only' | 'read_write' | 'admin';
}

export interface RotateKeyResponse {
  api_key: string;
  scope: string;
  tenant_id: string;
  created_at: string;
}

export interface CreateApiKeyRequest {
  name: string;
  isSandbox: boolean;
  keyScope: 'read_only' | 'read_write' | 'admin';
}

export interface CreateApiKeyResponse {
  api_key: string;
  scope: 'live' | 'test';
  keyScope: 'read_only' | 'read_write' | 'admin';
  tenant_id: string;
  created_at: string;
  name: string;
}

export interface TenantApiKeyMetadata {
  key_id: string;
  scope: 'live' | 'test';
  keyScope?: 'read_only' | 'read_write' | 'admin';
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
  name?: string;
}

export interface TenantApiKeySettingsResponse {
  tenant_id: string;
  tenant_name: string;
  keys: TenantApiKeyMetadata[];
}

export interface TenantUsageResponse {
  tenant_id: string;
  hours: number;
  usage: Array<{
    hour: string;
    requests: number;
  }>;
}


export interface CreateTenantRequest {
  name: string;
  contact_email?: string;
}

export interface CreatedTenantResponse {
  tenant_id: string;
  name: string;
  contact_email: string | null;
  live_key: string;
  test_key: string;
  created_at: string;
}

export interface InviteAdminUserRequest {
  email: string;
  role: AdminRole;
}

export interface InviteAdminUserResponse {
  message: string;
  invite_link: string;
  admin_user: {
    id: string;
    email: string;
    role: AdminRole;
    is_active: boolean;
  };
}

export interface TenantEmployee {
  id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  invited_at: string | null;
  activated_at: string | null;
}

export interface TenantEmployeeListResponse {
  tenant_id: string;
  total: number;
  query: string | null;
  data: TenantEmployee[];
}


export interface UnifiedSearchWalletResult {
  id: string;
  external_user_id: string;
  status: string;
  balance: string;
  currency: string;
  tenant_name: string;
}

export interface UnifiedSearchTransactionResult {
  id: string;
  type: string;
  amount: string;
  currency: string;
  idempotency_key: string | null;
  request_id: string | null;
  wallet_id: string;
  tenant_name: string;
  created_at: string;
}

export interface UnifiedSearchRequestResult {
  id: string;
  transaction_id: string;
  wallet_id: string;
  tenant_name: string;
  created_at: string;
}

export interface UnifiedSearchUserResult {
  id: string;
  email: string;
  role: string;
  tenant_name: string;
}

export interface UnifiedSearchResponse {
  wallets: UnifiedSearchWalletResult[];
  transactions: UnifiedSearchTransactionResult[];
  requests: UnifiedSearchRequestResult[];
  users: UnifiedSearchUserResult[];
}

export interface SystemBalanceResponse {
  total_live: string;
  total_sandbox: string;
  currency_breakdown: Record<string, { live: string; sandbox: string }>;
  calculated_at: string;
  currency?: string;
  currency_code?: string;
}

export interface AdminActivityLog {
  id: string;
  tenant: {
    tenant_id: string;
    name: string;
  };
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  changes: Record<string, unknown>;
  timestamp: string;
  is_sandbox: boolean;
}

export interface AdminActivityResponse {
  data: AdminActivityLog[];
  next_cursor?: string;
}

export interface SystemError {
  id: string;
  timestamp: string;
  tenant: {
    tenant_id: string;
    name: string;
  };
  error_type: string;
  message: string;
  endpoint: string;
  request_id: string | null;
  actor: string;
  is_sandbox: boolean;
}

export interface SystemErrorsResponse {
  data: SystemError[];
  total_count: number;
}

export interface AdminAuditQuery {
  wallet_id?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  after?: string;
  tenantId?: string;
}

export interface AdminActivityQuery {
  adminEmail?: string;
  actionType?: string;
  from?: string;
  to?: string;
  limit?: number;
  after?: string;
}
