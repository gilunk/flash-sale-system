import type { PurchaseError, PurchaseResult as Result } from '../../types';

interface PurchaseResultProps {
  result: Result;
}

const errorCopy: Record<PurchaseError, { title: string; body: string }> = {
  ALREADY_PURCHASED: {
    title: 'You already purchased an item.',
    body: 'Each email is limited to one purchase.',
  },
  SOLD_OUT: {
    title: 'Sold out.',
    body: 'All items have been claimed. Better luck next time.',
  },
  SALE_ENDED: {
    title: 'The sale has ended.',
    body: 'Purchases are no longer being accepted.',
  },
  SALE_NOT_STARTED: {
    title: 'The sale has not started yet.',
    body: 'Please wait until the sale window opens.',
  },
};

export function PurchaseResult({ result }: PurchaseResultProps) {
  if (result.kind === 'idle' || result.kind === 'pending') return null;

  if (result.kind === 'success') {
    return (
      <div className="flex flex-col gap-1 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-300 dark:bg-emerald-50 dark:text-emerald-900">
        <span className="text-sm font-semibold">Purchase confirmed.</span>
        <span className="text-xs">
          Order ID:{' '}
          <span className="font-mono">{result.orderId}</span>
        </span>
      </div>
    );
  }

  if (result.kind === 'unknown-error') {
    return (
      <div className="flex flex-col gap-1 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-300 dark:bg-rose-50 dark:text-rose-900">
        <span className="text-sm font-semibold">Something went wrong.</span>
        <span className="text-xs">{result.message}</span>
      </div>
    );
  }

  const copy = errorCopy[result.error];
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-300 dark:bg-amber-50 dark:text-amber-900">
      <span className="text-sm font-semibold">{copy.title}</span>
      <span className="text-xs">{copy.body}</span>
    </div>
  );
}
