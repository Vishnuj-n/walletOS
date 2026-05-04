import { TransactionResponse } from '@walletOS/types';

export interface SessionResponse {
  token: string;
  wallet_id: string;
  expires_at: string;
}

export interface TransactionListResponse {
  data: TransactionResponse[];
  next_cursor: string | null;
}
