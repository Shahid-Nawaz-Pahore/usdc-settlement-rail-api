const META = {
  RECEIVED: {
    dot: 'bg-slate-400',
    cls: 'bg-slate-500/10 text-slate-300 ring-slate-400/25',
  },
  COMPLIANCE_APPROVED: {
    dot: 'bg-brand-400',
    cls: 'bg-brand-500/10 text-brand-300 ring-brand-400/30',
  },
  REJECTED_COMPLIANCE: {
    dot: 'bg-rose-400',
    cls: 'bg-rose-500/10 text-rose-300 ring-rose-400/30',
  },
  SUBMITTED: {
    dot: 'bg-amber-400',
    cls: 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
    pulse: true,
  },
  CONFIRMED: {
    dot: 'bg-cyan-400',
    cls: 'bg-cyan-500/10 text-cyan-300 ring-cyan-400/30',
    pulse: true,
  },
  FINAL: {
    dot: 'bg-emerald-400',
    cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30',
  },
  FAILED: {
    dot: 'bg-rose-500',
    cls: 'bg-rose-600/15 text-rose-300 ring-rose-500/30',
  },
};

export default function StatusBadge({ status }) {
  const m = META[status] ?? META.RECEIVED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ring-1 ring-inset ${m.cls}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${m.dot} ${m.pulse ? 'animate-pulse' : ''}`}
      />
      {status}
    </span>
  );
}
