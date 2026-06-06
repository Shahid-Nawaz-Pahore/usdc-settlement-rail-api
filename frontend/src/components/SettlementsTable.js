import StatusBadge from './StatusBadge';
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
    <div className="rounded-2xl border border-ink-700 bg-ink-800/60 shadow-lg">
      <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Settlements
        </h2>
        <span className="text-[11px] text-slate-500">
          {settlements.length} record{settlements.length === 1 ? '' : 's'} · live
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
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
          <tbody className="divide-y divide-ink-700/70">
            {loading && settlements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && settlements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                  No settlements yet — submit one to get started.
                </td>
              </tr>
            )}
            {settlements.map((s) => (
              <tr key={s.id} className="hover:bg-ink-700/30">
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
                    className="font-mono text-xs text-slate-400 hover:text-indigo-300"
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
                  {s.txHash ? (
                    <a
                      href={explorerTx(s.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-indigo-300 hover:text-indigo-200"
                      title={s.txHash}
                    >
                      {shortHash(s.txHash)} ↗
                    </a>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </Td>
                <Td className="text-xs text-slate-500">
                  {formatTime(s.updatedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-5 py-3 align-middle ${className}`}>{children}</td>;
}
