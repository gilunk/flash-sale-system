// UI-side mirror of the backend response shapes. Once you wire the API,
// you can replace these with imports from `@flash-sale/types` if you like.

export type SaleState = 'PENDING' | 'ACTIVE' | 'ENDED' | 'SOLD_OUT';

export interface SaleStatus {
  saleId: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  totalStock: number;
  remainingStock: number;
  state: SaleState;
}

export type PurchaseError =
  | 'SALE_NOT_STARTED'
  | 'SALE_ENDED'
  | 'SOLD_OUT'
  | 'ALREADY_PURCHASED';

// Local UI status for the post-click result. Distinct from SaleState so that the
// page can show "you bought" vs "sale is active" simultaneously.
export type PurchaseResult =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; orderId: string }
  | { kind: 'rejected'; error: PurchaseError }
  | { kind: 'unknown-error'; message: string };
