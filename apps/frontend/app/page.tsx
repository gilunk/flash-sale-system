'use client';

import { PurchaseResult } from '@/types';
import { ProductCard } from './components/ProductCard';
import { PurchaseForm } from './components/PurchaseForm';
import { PurchaseResult as PurchaseResultBanner } from './components/PurchaseResult';
import { StatusPanel } from './components/StatusPanel';
import { usePersistedEmail, usePurchase, useSaleStatus } from '@/libs/api-hooks';

export default function Home() {
  const { data: sale, isLoading, isError, error } = useSaleStatus();
  const purchase = usePurchase();
  const [email, setEmail] = usePersistedEmail();

  // Map mutation lifecycle → the banner's discriminated union.
  const result: PurchaseResult = purchase.isPending
    ? { kind: 'pending' }
    : purchase.isError
      ? { kind: 'unknown-error', message: purchase.error?.message ?? 'Network error' }
      : (purchase.data ?? { kind: 'idle' });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-white px-4 py-12">
        <div className="h-64 w-full max-w-5xl animate-pulse rounded-2xl bg-sky-100" />
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12 text-center">
        <p className="text-sm text-rose-700">
          Couldn&rsquo;t reach the flash sale service.{' '}
          {error instanceof Error ? error.message : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-12">
      <main className="grid w-full max-w-5xl gap-6 sm:grid-cols-2">
        <ProductCard
          productName={sale.productName}
          productImageUrl={sale.productImageUrl}
        />
        <div className="flex flex-col gap-4">
          <StatusPanel sale={sale} />
          <PurchaseForm
            email={email}
            onEmailChange={setEmail}
            saleState={sale.state}
            isSubmitting={purchase.isPending}
            onSubmit={(submittedEmail) => purchase.mutate({ 
              email: submittedEmail,
              saleId: sale.saleId 
            })}
          />
          <PurchaseResultBanner result={result} />
        </div>
      </main>
    </div>
  );
}
