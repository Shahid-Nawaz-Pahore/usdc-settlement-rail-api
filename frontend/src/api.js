// Fetch client for the settlement-rail API.
//
// Base URL resolution:
//   - REACT_APP_API_URL set (deployed)  -> absolute calls to that origin
//     (the backend must allow this frontend's origin via ALLOWED_ORIGIN).
//   - unset (local dev)                  -> relative paths, proxied to :3000
//     by CRA's "proxy" field (no CORS preflight in dev).
const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');

const url = (path) => `${API_BASE}${path}`;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parse(res) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Backend error shape: { statusCode, error, message }
    let message = `Request failed (${res.status})`;
    if (data && data.message) {
      message = Array.isArray(data.message)
        ? data.message.join('; ')
        : data.message;
    }
    throw new ApiError(message, res.status);
  }
  return data;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export const api = {
  listSettlements: () => fetch(url('/settlements')).then(parse),

  getSettlement: (id) => fetch(url(`/settlements/${id}`)).then(parse),

  getTransitions: (id) =>
    fetch(url(`/settlements/${id}/transitions`)).then(parse),

  // Returns { status, data } so the UI can distinguish 201 (new) from 200 (idempotent).
  createSettlement: async (body) => {
    const res = await fetch(url('/settlements'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    const data = await parse(res);
    return { status: res.status, data };
  },

  getBalance: () => fetch(url('/ledger/balance')).then(parse),

  runReconciliation: () => fetch(url('/reconciliation')).then(parse),
};
