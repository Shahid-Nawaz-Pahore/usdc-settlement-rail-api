import StatusBadge from './StatusBadge';
import { ArrowUpRight } from './icons';
import {
  shortHash,
  shortAddr,
  explorerTx,
  explorerAddress,
  formatTime,
  usdc,
} from '../lib/format';

const IN_FLIGHT = new Set(['SUBMITTED', 'CONFIRMED']);

export default function SettlementsTable({ settlements, loading }) {
  return (
    <div className="glass animate-fade-in overflow-hidden rounded-2xl shadow-card">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-100">Settlements</h2>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {settlements.length} record{settlements.length === 1 ? '' : 's'} · live
        </span>
      </div>

      {loading && settlements.length === 0 ? (
        <Empty>Loading…</Empty>
      ) : settlements.length === 0 ? (
        <Empty>No settlements yet — submit one to get started.</Empty>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden max-h-[620px] overflow-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-ink-900/80 backdrop-blur">
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <Th>Instruction</Th>
                  <Th>To</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Conf.</Th>
                  <Th>Tx</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {settlements.map((s) => (
                  <tr key={s.id} className="transition hover:bg-white/[0.04]">
                    <Td>
                      <span className="font-medium text-slate-200">
                        {s.instructionId}
                      </span>
                    </Td>
                    <Td>
                      <a
                        href={explorerAddress(s.toAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-slate-400 transition hover:text-brand-300"
                        title={s.toAddress}
                      >
                        {shortAddr(s.toAddress)}
                      </a>
                    </Td>
                    <Td className="text-right font-mono text-slate-100">
                      {usdc(s.amount)}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={s.status} />
                        {s.failureReason && (
                          <span
                            className="text-[11px] text-rose-400"
                            title={s.failureReason}
                          >
                            {s.failureReason}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="text-right">
                      {IN_FLIGHT.has(s.status) ? (
                        <span className="font-mono text-amber-300">
                          {s.confirmations ?? 0}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </Td>
                    <Td>
                      <TxLink txHash={s.txHash} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {formatTime(s.updatedAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 p-3 md:hidden">
            {settlements.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">
                    {s.instructionId}
                  </span>
                  <span className="font-mono text-slate-100">
                    {usdc(s.amount)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <StatusBadge status={s.status} />
                  {IN_FLIGHT.has(s.status) && (
                    <span className="text-[11px] text-amber-300">
                      {s.confirmations ?? 0} conf
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <a
                    href={explorerAddress(s.toAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-slate-400"
                    title={s.toAddress}
                  >
                    {shortAddr(s.toAddress)}
                  </a>
                  <TxLink txHash={s.txHash} />
                </div>
                {s.failureReason && (
                  <div className="mt-2 text-[11px] text-rose-400">
                    {s.failureReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
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
      className="inline-flex items-center gap-1 font-mono text-xs text-brand-300 transition hover:text-brand-200"
      title={txHash}
    >
      {shortHash(txHash)}
      <ArrowUpRight width={12} height={12} />
    </a>
  );
}

function Empty({ children }) {
  return (
    <div className="px-5 py-12 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-5 py-3.5 align-middle ${className}`}>{children}</td>;
}
