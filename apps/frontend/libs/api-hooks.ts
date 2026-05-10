// apps/frontend/app/hooks.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { attemptPurchase, fetchSaleStatus } from './api-endpoints';
import { PurchaseResult, SaleStatus } from '@/types';

const SALE_STATUS_KEY = ['sale-status'] as const;

export function useSaleStatus() {
  return useQuery<SaleStatus>({
    queryKey: SALE_STATUS_KEY,
    queryFn: ({ signal }) => fetchSaleStatus(signal),
    refetchInterval: 1_000,             // poll every 1s
    refetchIntervalInBackground: false, // pause when tab is hidden
  });
}

export function usePurchase() {
  const queryClient = useQueryClient();

  return useMutation<PurchaseResult, Error, { email: string, saleId: string }>({
    mutationFn: ({ email, saleId }) =>
      attemptPurchase({ email, saleId, idempotencyKey: crypto.randomUUID() }),
    onSettled: (result) => {
      // success or business-rejected → server stock changed; refresh now
      if (result?.kind !== 'pending') {
        queryClient.invalidateQueries({ queryKey: SALE_STATUS_KEY });
      }
    },
  });
}

const EMAIL_STORAGE_KEY = 'flash-sale.email';

export function usePersistedEmail() {
  // Initial render is empty (SSR-safe). The effect rehydrates from localStorage
  // post-mount — there's a one-frame flicker, which is fine.
  const [email, setEmail] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(EMAIL_STORAGE_KEY);
    if (stored) setEmail(stored);
  }, []);

  useEffect(() => {
    if (email) localStorage.setItem(EMAIL_STORAGE_KEY, email);
  }, [email]);

  return [email, setEmail] as const;
}
