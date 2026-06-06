export function shortHash(hash, lead = 8, tail = 6) {
  if (!hash) return '—';
  if (hash.length <= lead + tail) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

export function shortAddr(addr) {
  return shortHash(addr, 6, 4);
}

// Block explorer base URL — switchable by config (defaults to Ethereum Sepolia).
const EXPLORER_BASE = (
  process.env.REACT_APP_EXPLORER_BASE_URL || 'https://sepolia.etherscan.io'
).replace(/\/+$/, '');

export function explorerTx(hash) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

export function explorerAddress(addr) {
  return `${EXPLORER_BASE}/address/${addr}`;
}

export function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function usdc(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return `${value}`;
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} USDC`;
}
