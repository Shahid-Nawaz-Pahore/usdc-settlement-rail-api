import { useState } from 'react';
import { api, ApiError } from '../api';
import { usdc, formatTime } from '../lib/format';

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

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800/60 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Reconciliation
        </h2>
        <button
          onClick={runNow}
          disabled={loading}
          className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-ink-700 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run now'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}

      {!run && !error && (
        <p className="text-sm text-slate-500">
          Run a check to compare the ledger against the chain. Also runs
          automatically on the server cron.
        </p>
      )}

      {run && (
        <div className="space-y-3">
          <div
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              matched
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-rose-500/40 bg-rose-500/10'
            }`}
          >
            <span
              className={`text-sm font-bold tracking-wide ${
                matched ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {run.status}
            </span>
            <span className="text-[11px] text-slate-400">
              {formatTime(run.createdAt)}
            </span>
          </div>
          <Line label="Ledger balance" value={usdc(run.ledgerBalance)} />
          <Line label="Pending amount" value={usdc(run.pendingAmount)} />
          <Line label="Chain balance" value={usdc(run.chainBalance)} />
          <Line
            label="Diff (ledger − pending − chain)"
            value={usdc(run.diff)}
            tone={matched ? 'good' : 'bad'}
          />
        </div>
      )}
    </div>
  );
}

function Line({ label, value, tone }) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'bad'
        ? 'text-rose-300'
        : 'text-slate-200';
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`font-mono text-sm ${toneClass}`}>{value}</span>
    </div>
  );
}
