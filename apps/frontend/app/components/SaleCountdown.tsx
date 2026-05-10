'use client';

import { useEffect, useState } from 'react';

interface SaleCountdownProps {
  targetIso: string;
  label: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export function SaleCountdown({ targetIso, label }: SaleCountdownProps) {
  // `now` is null until the effect runs post-mount, which keeps the SSR
  // and first client render byte-identical and avoids a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = now === null ? null : new Date(targetIso).getTime() - now;
  const finished = remaining !== null && remaining <= 0;
  const display = remaining === null ? '--:--:--' : formatRemaining(remaining);

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-xs font-medium uppercase tracking-widest text-sky-900/70">
        {label}
      </span>
      <span
        className={`font-mono text-3xl font-semibold tabular-nums ${
          finished ? 'text-sky-900/40' : 'text-sky-950'
        }`}
      >
        {display}
      </span>
    </div>
  );
}
