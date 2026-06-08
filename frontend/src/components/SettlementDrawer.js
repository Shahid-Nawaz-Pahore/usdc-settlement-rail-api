import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import StatusBadge from './StatusBadge';
import { ArrowUpRight } from './icons';
import {
  usdc,
  shortHash,
  shortAddr,
  explorerTx,
  explorerAddress,
  formatTime,
} from '../lib/format';

const DOT = {
  FINAL: 'bg-emerald-400',
  REJECTED_COMPLIANCE: 'bg-rose-400',
  FAILED: 'bg-rose-500',
  SUBMITTED: 'bg-amber-400',
  CONFIRMED: 'bg-cyan-400',
  COMPLIANCE_APPROVED: 'bg-brand-400',
  RECEIVED: 'bg-slate-400',
};

/**
 * Read-only detail drawer: settlement summary + its StatusTransition audit trail
 * as a vertical timeline (oldest at top, newest at bottom).
 */
export default function SettlementDrawer({ settlement, onClose }) {
  const [transitions, setTransitions] = useState(null);
  const [error, setError] = useState(null);

  const id = settlement?.id;

  useEffect(() => {
    if (!id) return;
    let active = true;
    setTransitions(null);
    setError(null);
    api
      .getTransitions(id)
      .then((rows) => active && setTransitions(rows))
      .catch((e) =>
        active && setError(e instanceof ApiError ? e.message : 'Network error'),
      );
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!settlement) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="glass absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col border-l border-white/10 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Settlement detail
            </h2>
            <p className="font-mono text-[11px] text-slate-500">
              {settlement.instructionId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto p-5">
          {/* Summary */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-lg text-slate-100">
                {usdc(settlement.amount)}
              </span>
              <StatusBadge status={settlement.status} />
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="To">
                <a
                  href={explorerAddress(settlement.toAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-slate-300 hover:text-brand-300"
                  title={settlement.toAddress}
                >
                  {shortAddr(settlement.toAddress)}
                </a>
              </Row>
              <Row label="Tx">
                <TxLink txHash={settlement.txHash} />
              </Row>
              <Row label="Nonce">
                <span className="font-mono text-slate-300">
                  {settlement.nonce ?? '—'}
                </span>
              </Row>
              {settlement.failureReason && (
                <Row label="Failure">
                  <span className="text-rose-400">
                    {settlement.failureReason}
                  </span>
                </Row>
              )}
            </dl>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
              Status history
            </h3>
            {error ? (
              <p className="text-xs text-rose-400">{error}</p>
            ) : transitions === null ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : transitions.length === 0 ? (
              <p className="text-xs text-slate-500">
                No transitions recorded yet.
              </p>
            ) : (
              <ol>
                {transitions.map((t, i) => (
                  <li key={t.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1 h-3 w-3 shrink-0 rounded-full ${DOT[t.toStatus] ?? 'bg-slate-400'}`}
                      />
                      {i < transitions.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-white/10" />
                      )}
                    </div>
                    <div className="pb-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={t.fromStatus} />
                        <span className="text-slate-500">→</span>
                        <StatusBadge status={t.toStatus} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span>{formatTime(t.createdAt)}</span>
                        {t.txHash && <TxLink txHash={t.txHash} />}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TxLink({ txHash }) {
  if (!txHash) return <span className="text-slate-600">—</span>;
  return (
    <a
      href={explorerTx(txHash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-brand-300 transition hover:text-brand-200"
      title={txHash}
    >
      {shortHash(txHash)}
      <ArrowUpRight width={12} height={12} />
    </a>
  );
}
