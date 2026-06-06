const STYLES = {
  RECEIVED: 'bg-slate-600/30 text-slate-200 border-slate-500/40',
  COMPLIANCE_APPROVED: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  REJECTED_COMPLIANCE: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  SUBMITTED: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  CONFIRMED: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  FINAL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  FAILED: 'bg-rose-600/25 text-rose-300 border-rose-600/40',
};

export default function StatusBadge({ status }) {
  const cls = STYLES[status] ?? 'bg-slate-600/30 text-slate-200 border-slate-500/40';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
