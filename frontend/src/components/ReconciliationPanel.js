import { useState } from 'react';
import { api, ApiError } from '../api';
import { ScaleIcon, RefreshIcon } from './icons';

/**
 * Reconciliation KPI card: runs ledger-vs-chain on demand and shows the verdict.
 */
export default function ReconciliationPanel() {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runNow() {
    setLoading(true);
    setError(null);
    try {
      setRun(await api.runReconciliation());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  const matched = run?.status === 'MATCHED';
  const valueColor = !run
    ? 'text-slate-300'
    : matched
      ? 'text-emerald-300'
      : 'text-rose-300';

  return (
    <div className="glass animate-fade-in rounded-2xl p-4 shadow-card ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.05]">
      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-300">
          <ScaleIcon />
        </span>
        <button
          onClick={runNow}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          title="Run reconciliation now"
        >
          <RefreshIcon
            width={13}
            height={13}
            className={loading ? 'animate-spin' : ''}
          />
          {loading ? 'Running' : 'Run'}
        </button>
      </div>
      <div className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        Reconciliation
      </div>
      <div className={`mt-0.5 text-2xl font-semibold ${valueColor}`}>
        {run ? run.status : '—'}
      </div>
      <div className="mt-1 truncate text-[11px] text-slate-500">
        {error
          ? error
          : run
            ? `diff ${run.diff} · ledger ${run.ledgerBalance} vs chain ${run.chainBalance}`
            : 'Ledger vs chain · also on a server cron'}
      </div>
    </div>
  );
}
