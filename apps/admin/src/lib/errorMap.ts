export const ERROR_CODE_TO_MESSAGE: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance for this operation.',
  WALLET_FROZEN: 'This wallet is frozen and cannot process transactions.',
  WALLET_CLOSED: 'This wallet is permanently closed.',
  WALLET_ALREADY_EXISTS: 'A wallet already exists for this user in this tenant.',
  WALLET_ALREADY_FROZEN: 'This wallet is already frozen.',
  WALLET_BALANCE_NOT_ZERO: 'Wallet balance must be zero before closure.',
  WALLET_ALREADY_CLOSED: 'This wallet is already closed.',
  IDEMPOTENCY_CONFLICT: 'Duplicate request key was reused with different payload.',
  CANNOT_REVERSE_REVERSAL: 'A reversal transaction cannot be reversed again.',
  ALREADY_REVERSED: 'This transaction has already been reversed.',
  CROSS_TENANT_TRANSFER: 'Transfers across tenants are not allowed.',
  CURRENCY_MISMATCH: 'Wallet currencies must match for this operation.',
  INVALID_OPERATION: 'This operation is not allowed for the current state.',
  TENANT_ISOLATION: 'You do not have access to this tenant resource.',
  NOT_FOUND: 'Requested resource was not found.',
  UNAUTHORIZED: 'Your session is invalid. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please retry shortly.',
  VALIDATION_ERROR: 'Submitted data is invalid. Please review and retry.',
  INTERNAL_ERROR: 'An internal error occurred. Please try again.',
};

export function mapErrorCodeToMessage(errorCode?: string, fallbackMessage?: string): string {
  if (!errorCode) {
    return fallbackMessage ?? 'Request failed.';
  }
  return ERROR_CODE_TO_MESSAGE[errorCode] ?? fallbackMessage ?? 'Request failed.';
}

