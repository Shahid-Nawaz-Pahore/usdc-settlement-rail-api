/**
 * Live end-to-end verification against the running API + Ethereum Sepolia.
 *
 * Prereqs: backend running (npm run start:dev) with the FUNDED operator key in
 * .env, Postgres migrated, and reconciliation MATCHED at rest.
 *
 * Run:  node --env-file=.env scripts/live-verify.mjs
 *
 * Automates tests 1–5 and 7 from TESTING.md. Test 6 (restart recovery) requires
 * killing/restarting the process and is documented as a manual procedure.
 *
 * Keeps the total spend small (≤ ~3 USDC). Prints a Markdown results block to
 * paste into TESTING.md and exits non-zero if any assertion fails.
 */
import { JsonRpcProvider } from 'ethers';

const API = process.env.API_BASE_URL || 'http://localhost:3000';
const RPC = process.env.RPC_HTTP_URL;
const EXPLORER = process.env.EXPLORER_BASE_URL || 'https://sepolia.etherscan.io';
const BLOCKED = '0x000000000000000000000000000000000000dEaD'; // checksummed blocklist entry

const provider = RPC ? new JsonRpcProvider(RPC) : null;
const results = [];
let failures = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body) {
  const res = await fetch(`${API}/settlements`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const get = (path) => fetch(`${API}${path}`).then((r) => r.json());

async function pollSettlement(id, until, timeoutMs = 240_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await get(`/settlements/${id}`);
    if (until(last)) return last;
    await sleep(3000);
  }
  throw new Error(`timeout waiting on ${id}, last status=${last?.status}`);
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
}

const rid = (p) => `${p}-${Math.floor(Math.random() * 1e9).toString(36)}`;

async function main() {
  // Pre-flight: reconciliation MATCHED at rest.
  const pre = await get('/reconciliation');
  record('Pre-flight reconciliation MATCHED', pre.status === 'MATCHED', `diff=${pre.diff}`);

  // ---- Test 1: happy path -------------------------------------------------
  {
    const id = rid('happy');
    const { status, data } = await post({
      instructionId: id,
      toAddress: process.env.TEST_RECIPIENT,
      amount: '0.5',
    });
    const created = status === 201;
    const final = await pollSettlement(
      data.id,
      (s) => s.status === 'FINAL' || s.status === 'FAILED',
    );
    let onchainOk = false;
    if (provider && final.txHash) {
      const rcpt = await provider.getTransactionReceipt(final.txHash);
      onchainOk = rcpt?.status === 1;
    }
    record(
      'T1 happy path reaches FINAL',
      created && final.status === 'FINAL' && onchainOk,
      `${EXPLORER}/tx/${final.txHash}`,
    );
  }

  // ---- Test 2: idempotency under race ------------------------------------
  {
    const id = rid('idem');
    const body = { instructionId: id, toAddress: process.env.TEST_RECIPIENT, amount: '0.1' };
    const responses = await Promise.all(Array.from({ length: 5 }, () => post(body)));
    const codes = responses.map((r) => r.status).sort();
    const ids = new Set(responses.map((r) => r.data.id));
    const got201 = codes.filter((c) => c === 201).length;
    const got200 = codes.filter((c) => c === 200).length;
    record(
      'T2 idempotent race → one row, 1×201 + 4×200',
      ids.size === 1 && got201 === 1 && got200 === 4,
      `ids=${ids.size} codes=${codes.join(',')}`,
    );
  }

  // ---- Test 3: compliance rejection --------------------------------------
  {
    const id = rid('blocked');
    const { data } = await post({ instructionId: id, toAddress: BLOCKED, amount: '0.1' });
    await sleep(1500);
    const s = await get(`/settlements/${data.id}`);
    record(
      'T3 blocklisted → REJECTED_COMPLIANCE, no tx',
      s.status === 'REJECTED_COMPLIANCE' && !s.txHash,
      `status=${s.status}`,
    );
  }

  // ---- Test 4: validation -------------------------------------------------
  {
    const cases = [
      ['bad address', { instructionId: rid('v'), toAddress: '0x123', amount: '0.1' }, 400],
      ['negative amount', { instructionId: rid('v'), toAddress: process.env.TEST_RECIPIENT, amount: '-1' }, 400],
      ['7 decimals', { instructionId: rid('v'), toAddress: process.env.TEST_RECIPIENT, amount: '0.0000001' }, 400],
      ['over balance', { instructionId: rid('v'), toAddress: process.env.TEST_RECIPIENT, amount: '1000000' }, 422],
    ];
    for (const [label, body, expected] of cases) {
      const { status, data } = await post(body);
      const cleanBody =
        typeof data?.statusCode === 'number' && !!data?.error && !!data?.message;
      record(`T4 ${label} → ${expected}`, status === expected && cleanBody, `got ${status}`);
    }
  }

  // ---- Test 5: reconciliation mid-flight ---------------------------------
  {
    const id = rid('midflight');
    const { data } = await post({ instructionId: id, toAddress: process.env.TEST_RECIPIENT, amount: '0.1' });
    await pollSettlement(data.id, (s) => s.status === 'SUBMITTED' || s.status === 'CONFIRMED' || s.status === 'FINAL');
    const recon = await get('/reconciliation');
    record(
      'T5 reconciliation MATCHED mid-flight',
      recon.status === 'MATCHED',
      `pending=${recon.pendingAmount} diff=${recon.diff}`,
    );
    await pollSettlement(data.id, (s) => s.status === 'FINAL' || s.status === 'FAILED');
  }

  // ---- Test 7: concurrency -----------------------------------------------
  {
    const bodies = Array.from({ length: 5 }, () => ({
      instructionId: rid('conc'),
      toAddress: process.env.TEST_RECIPIENT,
      amount: '0.1',
    }));
    const created = await Promise.all(bodies.map(post));
    const finals = await Promise.all(
      created.map((c) => pollSettlement(c.data.id, (s) => s.status === 'FINAL' || s.status === 'FAILED')),
    );
    const allFinal = finals.every((s) => s.status === 'FINAL');
    const nonces = finals.map((s) => s.nonce).sort((a, b) => a - b);
    const sequential = nonces.every((n, i) => i === 0 || n === nonces[i - 1] + 1);
    record('T7 concurrency → all FINAL', allFinal, `statuses=${finals.map((s) => s.status).join(',')}`);
    record('T7 nonces strictly sequential', sequential, `nonces=${nonces.join(',')}`);
  }

  // ---- Summary ------------------------------------------------------------
  console.log('\n--- Markdown results (paste into TESTING.md) ---\n');
  for (const r of results) {
    console.log(`| ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail ?? ''} |`);
  }
  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Harness error:', err);
  process.exit(1);
});
