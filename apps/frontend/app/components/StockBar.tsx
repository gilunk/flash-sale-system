interface StockBarProps {
  remaining: number;
  total: number;
}

export function StockBar({ remaining, total }: StockBarProps) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.max(0, Math.min(1, remaining / safeTotal));
  const percent = Math.round(ratio * 100);

  // visual urgency cue — turns warm as stock dwindles
  const fillColor =
    ratio > 0.5
      ? 'bg-emerald-500'
      : ratio > 0.2
        ? 'bg-amber-500'
        : 'bg-rose-500';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-sky-900/70">
          Stock remaining
        </span>
        <span className="font-mono text-sm tabular-nums text-sky-950">
          {remaining}
          <span className="text-sky-900/50"> / {total}</span>
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sky-950/10"
        role="progressbar"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${fillColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
