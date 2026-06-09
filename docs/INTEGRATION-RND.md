# R&D — Integrating USDC Stablecoin Settlement into a Trading System

**Status:** Working proof-of-concept, running **live on Ethereum Sepolia** with
Circle USDC. Every core behavior is demonstrated on-chain with real transaction
hashes — see [TESTING.md](../TESTING.md). This document explains what was built,
the engineering decisions behind it, how it integrates with a trading system,
and the path from POC to production.

---

## 1. Executive summary

The goal: let a trading system **settle obligations in USDC on-chain** with the
same rigor it applies to its own books — deterministic, idempotent, fully
reconciled, and auditable.

We built a **clearing-to-chain settlement rail**: it accepts a settlement
instruction over REST, screens it, broadcasts a USDC transfer through a
self-built relayer with strict nonce discipline, tracks confirmations from the
chain itself (never from optimistic local state), books a **double-entry ledger**
in Postgres, and **continuously reconciles** that ledger against the on-chain
balance. A real-time operator dashboard exposes balances, live status, the
audit trail per settlement, and reconciliation.

The POC proves the hard parts — nonce/relayer correctness, idempotency,
confirmation tracking, crash recovery, and reconciliation. The remaining work to
production is **integration and hardening**, not invention: custody, funding,
throughput, multi-chain, and a production compliance provider — each has a
defined plug-in point already in the codebase.

---

## 2. Objective & scope

**In scope (POC, delivered & verified live):**
- Outbound USDC settlement of clearing instructions on Ethereum Sepolia.
- Self-built relayer (no managed relayer dependency).
- Listener-driven confirmation tracking; configurable finality.
- Double-entry internal ledger + continuous reconciliation.
- Idempotent submission; crash/restart recovery.
- Compliance screening (pluggable; mock provider).
- Operator dashboard + REST/OpenAPI API.

**Out of scope for the POC (designed-for; see §7):**
- Inbound deposits / funding flows, cross-chain, multi-wallet throughput,
  production custody (KMS/HSM/MPC), and a live compliance vendor.

---

## 3. What was built (capabilities)

| Capability | What it does | Proven |
| --- | --- | --- |
| Settlement API | `POST /settlements` → validate → screen → broadcast → finalize | live |
| Idempotency | Same `instructionId` returns the original; money moves **once** | live + unit |
| Self-built relayer | One in-flight tx, gap-free sequential nonces, gas-bump resends | live + unit |
| Listener as source of truth | Status advances only from on-chain receipts | live |
| Configurable finality | `CONFIRMED` / `FINAL` at configurable block depths (1 / 5) | live |
| Crash recovery | In-flight settlements reconciled vs chain on restart, resumed | live |
| Double-entry ledger | Balanced DEBIT/CREDIT pair per finalized settlement; append-only | live + unit |
| Reconciliation | Ledger vs chain (accounting for in-flight); flags mismatch, never auto-corrects | live + unit |
| Audit trail | Timestamped status-transition history per settlement | live |
| Compliance gate | Screen recipient before broadcast; pluggable provider | live + unit |

**Live evidence (Ethereum Sepolia):** happy-path to FINAL, 5-way idempotency
race (1 transfer, others return the original), compliance rejection, validation
codes, mid-flight reconciliation MATCHED, restart recovery to FINAL, and
concurrency with strictly sequential nonces — all with explorer links in
[TESTING.md](../TESTING.md).

**Stack:** NestJS (TypeScript, strict) · ethers v6 · PostgreSQL via Prisma ·
`@nestjs/schedule` for cron · React + Tailwind dashboard.

---

## 4. Architecture

Two independent flows meet at the database.

**Submission path (request → broadcast):**
`POST /settlements` → idempotency check → balance check → persist `RECEIVED` →
compliance → `COMPLIANCE_APPROVED` → relayer FIFO queue → worker assigns nonce,
builds USDC transfer, signs, broadcasts → `SUBMITTED`.

**Confirmation & reconciliation loop (chain → books):**
A WSS subscription nudges, but a ~5s **receipt poll** is the authority:
`SUBMITTED → CONFIRMED` (depth ≥ N) → `FINAL` (depth ≥ M). On finalization the
ledger is booked **before** the status flips, so a crash in between is replayed
safely. A stuck-tx watcher gas-bumps unmined txs; a cron reconciler diffs ledger
vs chain.

**Data model (Postgres):** `Settlement` (with unique `instructionId`),
`LedgerEntry` (unique `(settlementId, account)`), `StatusTransition`
(append-only audit), `ReconciliationRun`. Money is `DECIMAL(38,6)` /
`bigint` — never floating point.

---

## 5. Key engineering decisions

Each as **Decision · Why · Trade-off / production evolution**.

**Self-built relayer (not Gelato/Defender).**
*Why:* nonce discipline and resend policy are the part worth owning. The worker
fetches the pending nonce once, tracks locally, increments only on accepted
broadcast; a mutex serializes sends and gas-bump resends so they never
interleave. *Evolution:* shard across a wallet pool for throughput, or front
with a managed relayer for gas abstraction — the confirmation/ledger core is
untouched.

**Listener as source of truth.**
*Why:* "broadcast accepted" ≠ "settled." Confirmation/finality are derived from
receipts at a configured depth, so reorgs and dropped txs are handled by
re-deriving state. *Evolution:* reorg-aware finality (track block hashes), an
indexer/subgraph at higher event volume.

**Double-entry ledger + independent reconciliation.**
*Why:* a self-balancing, append-only ledger is auditable; an *independent*
reconciler catches divergence the writer can't see itself causing. Mismatches
are logged loudly and **never auto-corrected** — silent "fixing" destroys
evidence. *Evolution:* per-client sub-ledgers, scheduled reports, alerting +
auto-freeze on mismatch.

**Idempotency.**
*Why:* `instructionId` unique constraint + catch the insert race → concurrent
identical submissions converge on one settlement and enqueue once. Ledger
finalization is idempotent via `unique(settlementId, account)`. *Evolution:*
per-client idempotency keys + response cache returning the original body.

**Restart recovery.**
*Why:* on boot, every in-flight settlement is reconciled against the chain
(mined-ok → finalize; reverted → fail; mempool → resume; dropped → re-queue with
the stored nonce). *Evolution:* durable queue (Redis/SQS) so work survives a
hard crash without a DB re-scan.

**Server-side (custodial) signing.**
*Why:* a settlement rail is a back-office process paying a treasury, not a
user-facing dApp; signing is a server responsibility and keeps nonce management
in one place. The key is read in exactly one spot, never logged. *Evolution:*
KMS/HSM or MPC/threshold signing; approval workflow (RBAC + multi-party) for
large settlements.

---

## 6. Integrating with a trading system

This is the part specific to the client. The rail is the **settlement leg**; the
trading system owns matching, risk, and positions. Integration points:

**6.1 Trade → settlement instruction.**
On a fill that requires a stablecoin movement, the trading system emits a
settlement instruction with a **stable, unique `instructionId`** (e.g.
`trade:<id>:leg:<n>`). Because submission is idempotent, the trading system can
**retry freely** on timeout/restart without double-paying — the rail
deduplicates. This is the single most important property for a trading context.

**6.2 Status callbacks / events.**
The trading system needs settlement state to advance trade lifecycle. Two
options, both supported by the model: (a) **poll** `GET /settlements/:id` for
`status` + `confirmations`; (b) production: emit **webhooks / a message-bus
event** on each `StatusTransition` (the audit rows already exist — surface them
as an outbox). Recommended terminal signal for the trading system is `FINAL`.

**6.3 Reconciliation with the trading book.**
The rail's `SETTLED_OUT` total and per-settlement ledger entries are the
authoritative record of what actually moved on-chain. The trading system
reconciles its expected settlements against this ledger **and** the rail
independently reconciles ledger vs chain — a two-layer check (trade-book ↔
ledger ↔ chain) that isolates where any break occurred.

**6.4 Treasury & funding.**
The operator wallet is a treasury that **only pays out**; it must be funded.
In production this is **Circle Mint** (fiat → USDC) and/or **client deposits**,
with **CCTP** to position liquidity on the venue's chain. Balance checks already
reject settlements exceeding available funds (422), giving the desk a hard
guardrail against over-disbursing.

**6.5 Risk controls.**
Already present: per-instruction validation, available-balance enforcement,
compliance screening, rate limiting. To add for trading: per-counterparty and
per-window **limits**, an approval threshold for large amounts, and a
kill-switch that drains the relayer queue (the drain flag exists).

**6.6 Finality & latency.**
Stablecoin finality is probabilistic by block depth. The desk chooses the
`CONFIRMED`/`FINAL` thresholds per risk appetite (faster release vs deeper
safety). Gas is an operational cost the desk should track per settlement (the
relayer records fees); it does not affect the USDC amount delivered.

---

## 7. Production roadmap (POC → production)

Phased, each building on a defined plug-in point in the codebase.

**Phase 1 — Custody & security.** Replace the in-process signer with **KMS/HSM
or MPC** (Fireblocks-style); key never in app memory. Add RBAC + approval
workflow for large settlements.

**Phase 2 — Funding & multi-chain.** Integrate **Circle Mint** for fiat↔USDC and
**CCTP** for cross-chain liquidity; add **inbound deposit flows** (per-client
deposit addresses + sweeping) so the ledger ingests funding, not just payouts.

**Phase 3 — Throughput.** **Multi-wallet relaying** (a `WalletPool` with
per-wallet nonce isolation → real parallelism) behind the existing relayer
interface; move the in-process queue to a **durable queue** (Redis/SQS).

**Phase 4 — Compliance & assurance.** Bind the existing `IComplianceProvider`
to **Chainalysis / TRM Labs**; add scheduled reconciliation reporting and
alerting (PagerDuty/Slack) with auto-freeze on mismatch.

**Phase 5 — Operations & HA.** Reorg-aware finality, structured metrics/tracing,
multi-instance HA (single-writer relayer with leader election), Postgres read
replicas + PITR for audit retention.

---

## 8. Security considerations

- **Key management:** custodial signing today, read once, never logged; move to
  KMS/HSM/MPC for production (Phase 1).
- **No secrets in code/history:** env-validated config; `.env` gitignored and
  absent from git history (verified).
- **Error hygiene:** 5xx responses are sanitized (no stack/SQL/env leakage);
  client errors carry a consistent shape.
- **Surface controls:** helmet, CORS allowlist (not wildcard), rate limiting on
  the settlement endpoint.
- **Exactly-once money movement:** enforced by DB unique constraints, not
  application guesswork.

---

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Double payment on retry | Idempotent `instructionId` (unique constraint + race handling) |
| Lost tx / process crash | Restart recovery reconciles in-flight vs chain |
| Stuck/underpriced tx | Gas-bump resend (same nonce), capped retries, then FAILED |
| Books drift from chain | Independent continuous reconciliation; loud, never auto-corrected |
| Reorg / false finality | Configurable depth; reorg-aware finality on the roadmap |
| Nonce corruption | Single in-flight tx + mutex; one EOA, gap-free nonces |
| Key compromise | Custodial isolation now; KMS/HSM/MPC + approvals in production |

---

## 10. Recommended next steps

1. **Align on the integration contract** — instruction schema, the `instructionId`
   convention from the trading system, and the terminal-status signal (webhook
   vs poll).
2. **Phase 1 (custody)** — pick the signing backend (KMS/HSM/MPC); it gates any
   mainnet pilot.
3. **Phase 2 (funding)** — wire Circle Mint + deposits so treasury funding flows
   into the ledger.
4. **Mainnet pilot** — small limits, full reconciliation + alerting, one chain,
   one corridor; expand from there.

---

## Appendix

- **Live verification & evidence:** [TESTING.md](../TESTING.md)
- **Architecture, diagrams, design decisions, API:** [README.md](../README.md)
- **OpenAPI docs:** `GET /api/docs` on the running service
- **Status lifecycle:** `RECEIVED → COMPLIANCE_APPROVED → SUBMITTED → CONFIRMED → FINAL`
  (with `REJECTED_COMPLIANCE` / `FAILED` terminal branches), every change in an
  append-only audit trail.
