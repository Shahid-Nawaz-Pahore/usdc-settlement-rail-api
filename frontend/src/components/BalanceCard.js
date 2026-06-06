import { usdc } from '../lib/format';

export default function BalanceCard({ balance, loading }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800/60 p-5 shadow-lg">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Ledger balance
      </h2>
      <div className="space-y-3">
        <Row
          label="Operator balance"
          value={loading ? null : usdc(balance?.operatorBalance)}
          emphasis
        />
        <Row
          label="In-flight"
          value={loading ? null : usdc(balance?.inFlightAmount)}
          tone="amber"
        />
        <div className="my-2 border-t border-ink-700" />
        <Row
          label="Available"
          value={loading ? null : usdc(balance?.availableBalance)}
          tone="emerald"
          emphasis
        />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Available = operator − in-flight. A new settlement can only draw against
        the available balance.
      </p>
    </div>
  );
}

function Row({ label, value, tone, emphasis }) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-300'
      : tone === 'emerald'
        ? 'text-emerald-300'
        : 'text-slate-100';
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-slate-400">{label}</span>
      {value === null ? (
        <span className="h-4 w-24 animate-pulse rounded bg-ink-700" />
      ) : (
        <span
          className={`font-mono ${emphasis ? 'text-base font-semibold' : 'text-sm'} ${toneClass}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
