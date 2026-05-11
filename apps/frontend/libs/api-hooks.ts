// apps/frontend/app/hooks.ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { attemptPurchase, fetchSaleStatus } from './api-endpoints';
import { PurchaseResult, SaleStatus } from '@/types';

const SALE_STATUS_KEY = ['sale-status'] as const;

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE ??
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api$/, '') ??
  'http://localhost:3200';

export function useSaleStatus() {
  const queryClient = useQueryClient();

  // Subscribe to live updates over a single WebSocket. Initial paint still
  // comes from the HTTP query below; the socket pushes deltas after that.
  useEffect(() => {
    const socket: Socket = io(`${WS_BASE}/sale-stream`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    // Push directly into React Query's cache — components re-render with no
    // extra HTTP round-trip.
    socket.on('sale:status', (next: SaleStatus) => {
      queryClient.setQueryData(SALE_STATUS_KEY, next);
    });

    // Safety net: if the socket drops, force a one-shot HTTP refetch so the
    // UI doesn't sit on stale data until the next 30s safety poll.
    socket.on('disconnect', () => {
      queryClient.invalidateQueries({ queryKey: SALE_STATUS_KEY });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [queryClient]);

  return useQuery<SaleStatus>({
    queryKey: SALE_STATUS_KEY,
    queryFn: ({ signal }) => fetchSaleStatus(signal),
    // No more 1s polling — WS handles real-time updates. The 30s refetch is a
    // safety net for missed events / dead sockets.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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
