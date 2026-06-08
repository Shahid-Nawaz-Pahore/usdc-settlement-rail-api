const ACCENTS = {
  emerald: { ring: 'ring-emerald-400/20', icon: 'text-emerald-300 bg-emerald-400/10', value: 'text-emerald-300' },
  brand: { ring: 'ring-brand-400/20', icon: 'text-brand-300 bg-brand-400/10', value: 'text-white' },
  amber: { ring: 'ring-amber-400/20', icon: 'text-amber-300 bg-amber-400/10', value: 'text-amber-200' },
  slate: { ring: 'ring-white/10', icon: 'text-slate-300 bg-white/5', value: 'text-white' },
};

/**
 * Compact KPI card: icon chip, label, big value, optional sub-line or action.
 */
export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'slate',
  loading = false,
  action,
}) {
  const a = ACCENTS[accent] ?? ACCENTS.slate;
  return (
    <div
      className={`glass animate-fade-in rounded-2xl p-4 shadow-card ring-1 ring-inset ${a.ring} transition hover:bg-white/[0.05]`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.icon}`}
        >
          {Icon ? <Icon /> : null}
        </span>
        {action}
      </div>
      <div className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {loading ? (
        <div className="mt-1 h-7 w-28 animate-pulse rounded-md bg-white/10" />
      ) : (
        <div className={`mt-0.5 font-mono text-2xl font-semibold ${a.value}`}>
          {value}
        </div>
      )}
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
