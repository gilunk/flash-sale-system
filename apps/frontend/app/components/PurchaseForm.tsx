'use client';

import { SaleState } from "@/types";


interface PurchaseFormProps {
  email: string;
  onEmailChange: (next: string) => void;
  saleState: SaleState;
  isSubmitting: boolean;
  onSubmit: (email: string) => void;
}

const buyButtonLabel: Record<SaleState, string> = {
  PENDING: 'Sale not started',
  ACTIVE: 'Buy now',
  ENDED: 'Sale ended',
  SOLD_OUT: 'Sold out',
};

export function PurchaseForm({
  email,
  onEmailChange,
  saleState,
  isSubmitting,
  onSubmit,
}: PurchaseFormProps) {
  const isActive = saleState === 'ACTIVE';
  const disabled = !isActive || isSubmitting || email.trim() === '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSubmit(email.trim());
      }}
      className="flex flex-col gap-3 rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-100 to-sky-200 p-6 shadow-sm"
    >
      <label
        htmlFor="email"
        className="text-xs font-medium uppercase tracking-widest text-sky-900/70"
      >
        Your email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        disabled={!isActive || isSubmitting}
        className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-sky-700 disabled:bg-sky-50 disabled:text-zinc-400"
        required
      />
      <button
        type="submit"
        disabled={disabled}
        className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-sky-950 text-base font-medium text-sky-50 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:bg-sky-900/30 disabled:text-sky-50/60"
      >
        {isSubmitting ? 'Processing…' : buyButtonLabel[saleState]}
      </button>
      <p className="text-xs text-sky-900/80">
        One purchase per email. Retries are safe — repeated clicks won&rsquo;t double-charge.
      </p>
    </form>
  );
}
