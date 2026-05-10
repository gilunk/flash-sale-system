// apps/frontend/app/api.ts

import { PurchaseError, PurchaseResult, SaleStatus } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3200/api';

const PURCHASE_ERROR_CODES = new Set<PurchaseError>([
  'SALE_NOT_STARTED',
  'SALE_ENDED',
  'SOLD_OUT',
  'ALREADY_PURCHASED',
]);

class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export async function fetchSaleStatus(signal?: AbortSignal): Promise<SaleStatus> {
  const res = await fetch(`${API_BASE}/sale/status`, { signal });
  if (!res.ok) throw new ApiError(`status ${res.status}`, res.status);
  return res.json();
}

export async function attemptPurchase(input: {
  email: string;
  saleId: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<PurchaseResult> {
  const res = await fetch(`${API_BASE}/sale/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({ 
      email: input.email,
      sale_id: input.saleId 
    }),
    signal: input.signal,
  });

  // 201 success
  if (res.ok) {
    const body: { orderId: string } = await res.json();
    return { kind: 'success', orderId: body.orderId };
  }

  // 409 = business error
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const code = body?.error;
    if (typeof code === 'string' && PURCHASE_ERROR_CODES.has(code as PurchaseError)) {
      return { kind: 'rejected', error: code as PurchaseError };
    }
  }

  // anything else (500, network) is genuinely unexpected
  const text = await res.text().catch(() => '');
  return {
    kind: 'unknown-error',
    message: text || `Request failed with status ${res.status}`,
  };
}
