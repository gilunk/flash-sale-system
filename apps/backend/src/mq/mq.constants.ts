export const PURCHASE_MQ = 'PURCHASE_MQ';

export const PURCHASE_CONFIRMED_PATTERN = 'purchase.confirmed';

export interface PurchaseConfirmedEvent {
  orderId: string;
  userId: string;
  email: string;
  saleId: string;
  remainingStock: number;
  occurredAt: string;
}
