import { useState } from 'react';
import { getAddress } from 'ethers';
import { api, ApiError } from '../api';

function randomInstructionId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `inv-${rand}`;
}

const inputClass =
  'w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm ' +
  'text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 ' +
  'focus:ring-indigo-500/60 focus:border-indigo-500/60';

export default function SubmitForm({ onSubmitted }) {
  const [instructionId, setInstructionId] = useState(randomInstructionId());
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { kind: 'ok'|'idempotent'|'error', text }

  const addrValid =
    toAddress.trim() !== '' && tryChecksum(toAddress) !== null;
  const amountValid = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;
  const canSubmit =
    instructionId.trim() !== '' && addrValid && amountValid && !submitting;

  function normalizeAddress() {
    const checksummed = tryChecksum(toAddress);
    if (checksummed) setToAddress(checksummed);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const { status, data } = await api.createSettlement({
        instructionId: instructionId.trim(),
        toAddress: getAddress(toAddress.trim()),
        amount: amount.trim(),
      });
      setResult({
        kind: status === 200 ? 'idempotent' : 'ok',
        text:
          status === 200
            ? `Idempotent: ${data.instructionId} already existed → ${data.status}`
            : `Accepted ${data.instructionId} → ${data.status}`,
      });
      // Prepare a fresh id for the next submission.
      setInstructionId(randomInstructionId());
      setAmount('');
      onSubmitted?.();
    } catch (err) {
      const text =
        err instanceof ApiError ? err.message : 'Network error — is the API up?';
      setResult({ kind: 'error', text });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-ink-700 bg-ink-800/60 p-5 shadow-lg"
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Submit settlement
      </h2>

      <div className="space-y-4">
        <Field label="Instruction ID" hint="idempotency key · ≤ 64 chars">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={instructionId}
              maxLength={64}
              onChange={(e) => setInstructionId(e.target.value)}
              placeholder="inv-001"
            />
            <button
              type="button"
              onClick={() => setInstructionId(randomInstructionId())}
              className="shrink-0 rounded-lg border border-ink-600 px-3 text-xs text-slate-300 hover:bg-ink-700"
              title="Generate a new id"
            >
              ↻
            </button>
          </div>
        </Field>

        <Field
          label="Recipient address"
          hint={
            toAddress === ''
              ? 'checksummed EVM address'
              : addrValid
                ? '✓ valid checksum'
                : '✗ invalid address'
          }
          hintTone={toAddress === '' ? 'muted' : addrValid ? 'good' : 'bad'}
        >
          <input
            className={inputClass}
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            onBlur={normalizeAddress}
            placeholder="0x…"
            spellCheck={false}
          />
        </Field>

        <Field label="Amount" hint="USDC · max 6 decimals">
          <input
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1.5"
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-5 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Submitting…' : 'Submit settlement'}
      </button>

      {result && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
            result.kind === 'error'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              : result.kind === 'idempotent'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {result.text}
        </div>
      )}
    </form>
  );
}

function Field({ label, hint, hintTone = 'muted', children }) {
  const toneClass =
    hintTone === 'good'
      ? 'text-emerald-400'
      : hintTone === 'bad'
        ? 'text-rose-400'
        : 'text-slate-500';
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <span className={`text-[11px] ${toneClass}`}>{hint}</span>
      </div>
      {children}
    </label>
  );
}

function tryChecksum(value) {
  try {
    return getAddress(value.trim());
  } catch {
    return null;
  }
}
