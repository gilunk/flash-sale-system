import type { SaleStatus } from '../../types';
import { SaleCountdown } from './SaleCountdown';
import { StockBar } from './StockBar';

interface StatusPanelProps {
  sale: SaleStatus;
}

const headlineByState: Record<SaleStatus['state'], string> = {
  PENDING: 'The flash sale starts soon.',
  ACTIVE: 'The flash sale is live.',
  ENDED: 'The flash sale has ended.',
  SOLD_OUT: 'Sold out.',
};

const subheadByState: Record<SaleStatus['state'], string> = {
  PENDING: 'Get ready — purchases open at the time below.',
  ACTIVE: 'Limited stock. One per buyer.',
  ENDED: 'Better luck next time.',
  SOLD_OUT: 'All items have been claimed.',
};

const accentByState: Record<SaleStatus['state'], string> = {
  PENDING: 'text-sky-950',
  ACTIVE: 'text-emerald-900',
  ENDED: 'text-sky-900/70',
  SOLD_OUT: 'text-rose-900',
};

export function StatusPanel({ sale }: StatusPanelProps) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-100 to-sky-200 p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className={`text-xl font-semibold ${accentByState[sale.state]}`}>
          {headlineByState[sale.state]}
        </h3>
        <p className="text-sm text-sky-900/80">
          {subheadByState[sale.state]}
        </p>
      </div>

      {sale.state === 'PENDING' && (
        <SaleCountdown label="Starts in" targetIso={sale.startsAt} />
      )}

      {sale.state === 'ACTIVE' && (
        <>
          <SaleCountdown label="Ends in" targetIso={sale.endsAt} />
          <StockBar remaining={sale.remainingStock} total={sale.totalStock} />
        </>
      )}

      {sale.state === 'SOLD_OUT' && (
        <StockBar remaining={0} total={sale.totalStock} />
      )}

      {sale.state === 'ENDED' && (
        <div className="text-sm text-sky-900/70">
          Ended at{' '}
          <span className="font-mono text-sky-950">
            {new Date(sale.endsAt).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
