export type PaymentToken = 'USDC' | 'ETH';

export interface PaymentQuote {
  readonly requestId: string;
  readonly token: PaymentToken;
  readonly chainId: number;
  readonly receivingAddress: `0x${string}`;
  readonly amountRaw: string;
  readonly amountUsdCents: number;
  readonly ethUsdRate: string | null;
  readonly quotedAt: number;
  readonly expiresAt: number;
}

export type PaymentRejectionReason =
  | 'tx_not_found'
  | 'tx_not_confirmed'
  | 'wrong_chain'
  | 'wrong_recipient'
  | 'wrong_token'
  | 'amount_below_quote'
  | 'quote_expired'
  | 'duplicate_payment'
  | 'forwarder_event_missing';

export interface PaymentVerificationOk {
  readonly ok: true;
  readonly requestId: string;
  readonly txHash: `0x${string}`;
  readonly chainId: number;
  readonly payerAddress: `0x${string}`;
  readonly tokenAddress: `0x${string}`;
  readonly amountRaw: string;
  readonly amountUsdCents: number;
  readonly blockNumber: number;
  readonly blockTimestamp: number;
}

export interface PaymentVerificationFail {
  readonly ok: false;
  readonly requestId: string;
  readonly reason: PaymentRejectionReason;
  readonly detail: string;
}

export type PaymentVerification = PaymentVerificationOk | PaymentVerificationFail;
