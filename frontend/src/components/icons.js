// Minimal inline icon set (stroke-based, currentColor) — no icon dependency.
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const WalletIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
    <path d="M3 7v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" />
    <path d="M16 12h5v3h-5a1.5 1.5 0 0 1 0-3Z" />
  </svg>
);

export const LayersIcon = (p) => (
  <svg {...base} {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const HourglassIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3h12M6 21h12" />
    <path d="M8 3c0 4 8 5 8 9s-8 5-8 9" />
    <path d="M16 3c0 4-8 5-8 9s8 5 8 9" />
  </svg>
);

export const ScaleIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3v18M7 21h10" />
    <path d="M5 7h14l-2 7H7L5 7Z" />
  </svg>
);

export const BoltIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

export const RefreshIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

export const ArrowUpRight = (p) => (
  <svg {...base} {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);
