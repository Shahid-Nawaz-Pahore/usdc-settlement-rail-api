# TESTING — live verification (Ethereum Sepolia)

Evidence that settlement-rail behaves correctly against the **live** chain, not
just unit tests. Every result below was produced by `scripts/live-verify.mjs`
(automates tests 1–5, 7) plus a scripted restart for test 6, against a real
funded operator on Ethereum Sepolia.

- **Operator:** [`0x74CDBd3cFD43756dC1eE41D0bCF9B321EaE61590`](https://sepolia.etherscan.io/address/0x74CDBd3cFD43756dC1eE41D0bCF9B321EaE61590)
- **Chain:** Ethereum Sepolia (chainId 11155111)
- **USDC:** [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) (Circle, 6 dp)
- **Opening balance:** 20 USDC snapshotted as the single `GENESIS` ledger entry on first boot
- **Confirmations:** CONFIRMED at 1 block, FINAL at 5 blocks
- **Run date:** 2026-06-08

> **Status: ✅ 11/11 automated checks pass + test 6 (restart recovery) verified.**
> One real bug was found and fixed during this run — see *Mid-flight
> reconciliation fix* below.

## How to reproduce

```bash
# Funded operator key in .env, Postgres migrated:
npm run db:deploy
npm run start:dev                                   # boots; logs "Opening balance snapshotted"
TEST_RECIPIENT=0x645242d9B255A9855aA6196e94bd4d02772747C8 \
  node --env-file=.env scripts/live-verify.mjs       # tests 1–5, 7
```

`TEST_RECIPIENT` is an external checksummed address (not the operator, not
blocklisted) so the operator's on-chain balance actually decreases. Total spend
for a full run is ~1.2 USDC.

## Results

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 0 | Reconciliation MATCHED at rest (before tests) | ✅ | `ledger=20 chain=20 pending=0 diff=0` |
| 1 | Happy path: 0.5 USDC → SUBMITTED → CONFIRMED → FINAL; ledger booked once | ✅ | [`0x7aae9294…fb4a583f`](https://sepolia.etherscan.io/tx/0x7aae92942a7d781a850151aa01ba70075cc58e52af6d248ee5ae7f50fb4a583f) |
| 2 | Idempotency under race: same instructionId ×5 → 1 row, **1×201 + 4×200**, one transfer | ✅ | `ids=1 codes=200,200,200,200,201` |
| 3 | Compliance: blocklisted recipient → REJECTED_COMPLIANCE, nothing broadcast | ✅ | `status=REJECTED_COMPLIANCE`, DB row has `nonce=null txHash=null` |
| 4 | Validation: bad address / negative / 7-dp → **400**; over-balance → **422**; clean error bodies | ✅ | `400, 400, 400, 422` |
| 5 | Reconciliation MATCHED at rest **and** mid-flight (pendingAmount absorbs in-flight) | ✅ | 10 in-flight samples all MATCHED, `pending=0.1 diff=0` |
| 6 | Restart recovery: kill at SUBMITTED, restart → resumes tracking → FINAL, no manual repair | ✅ | [`0xfc817ebb…fe386768`](https://sepolia.etherscan.io/tx/0xfc817ebbc3f33dcecc027b700bbc2597d8198e43e2b1ffb795b82fccfe386768) |
| 7 | Concurrency: 5 distinct in parallel → all FINAL, nonces **strictly sequential**, zero nonce errors | ✅ | nonces `597,598,599,600,601` |
| + | Rate limiting on `POST /settlements` (Section 4) | ✅ | 13 rapid POSTs → 10 pass, **3×429** |

### Test 7 — concurrency tx hashes (nonces strictly sequential, no gaps)

| nonce | amount | tx |
|---|---|---|
| 597 | 0.1 | [`0x7308d466…ab135323f`](https://sepolia.etherscan.io/tx/0x7308d466a8c131533ad83278f6b4fdea8d9ce12fb7eb1a5c1f46369ab135323f) |
| 598 | 0.1 | [`0xbc831ede…ff3a40e57d`](https://sepolia.etherscan.io/tx/0xbc831edeae986283ba18e2b3aff75506b65cea19d11962bdc03e77ff3a40e57d) |
| 599 | 0.1 | [`0x5a7cf592…14bce3b6`](https://sepolia.etherscan.io/tx/0x5a7cf59274e1fda812803adf2e9f7b90e8a74670593410285e6bc19114bce3b6) |
| 600 | 0.1 | [`0xf87ca2ac…75c3e205`](https://sepolia.etherscan.io/tx/0xf87ca2ac2944e8f32fb1d99660f187c4edf00f7d5ced7e3eb66dd08175c3e205) |
| 601 | 0.1 | [`0x0122be34…68464e777`](https://sepolia.etherscan.io/tx/0x0122be34984377f3fcdafe11bba9a79d8889283eb4eefad0924654268464e777) |

## Double-entry ledger (proof of balance)

After the run, the append-only ledger held exactly one DEBIT/CREDIT pair per
finalized settlement, perfectly balanced:

```
GENESIS      CREDIT  count=1   total=20.000000   (opening snapshot)
OPERATOR     DEBIT   count=18  total=2.900000
SETTLED_OUT  CREDIT  count=18  total=2.900000    (debits == credits)
```

Final reconciliation: `ledgerBalance=17.1  chainBalance=17.1  pendingAmount=0  diff=0  MATCHED`
(opening 20 − 2.9 settled = 17.1, matching the chain to the micro-USDC).

## Test 6 — restart recovery (log excerpt)

Settlement `c608ca5f…` was posted; the backend was killed the instant it logged
SUBMITTED (tx `0xfc817ebb…`, nonce 602). While the process was down, the DB row
sat at `SUBMITTED` (tx broadcast, ledger **not** booked). On restart:

```
[RelayerService]        Relayer starting — pending nonce=603
[RelayerService]        Recovering 1 SUBMITTED settlement(s)
[LedgerService]         Ledger booked settlement=c608ca5f… amount=0.3 (DEBIT OPERATOR / CREDIT SETTLED_OUT)
[SettlementStateService] Settlement c608ca5f… -> FINAL txHash=0xfc817ebb…
[ChainListenerService]  Settlement c608ca5f… FINAL tx=0xfc817ebb…
```

Reached FINAL and reconciliation MATCHED with **no manual intervention**. The
ledger is booked **before** the status flips to FINAL, so a crash in that window
is replayed safely (idempotent via the `unique(settlementId, account)` guard).

## Mid-flight reconciliation fix (bug found & fixed during this run)

The first harness run failed test 5 (`pending=0.2 diff=-0.2`). Root cause:
`pendingAmount` summed **all** SUBMITTED+CONFIRMED rows, but the chain balance
only drops once a tx is **mined**. During the mempool window a broadcast-but-
unmined tx had moved neither the chain nor the ledger (they already agreed), yet
the code subtracted it — manufacturing a false −0.2 mismatch.

Fix: `pendingAmount` now counts only in-flight settlements whose tx is **actually
mined** (receipt present, `status === 1`) — the precise value bridging ledger and
chain. Re-verified by sampling reconciliation across a settlement's whole
lifecycle (SUBMITTED → CONFIRMED×5 → FINAL): MATCHED at every step. See
`src/reconciliation/reconciliation.service.ts` (`computeMinedPending`).

## What "passing" means per test

- **1, 6, 7:** on-chain receipt `status === 1` at the recorded tx hash; DB `status = FINAL`;
  exactly one DEBIT/CREDIT ledger pair per settlement (no double-booking).
- **2:** `GET /settlements` shows a single row for the instructionId; exactly one tx hash.
- **3:** no `txHash`/`nonce`, terminal `REJECTED_COMPLIANCE`.
- **4:** HTTP 400/422 with body shape `{ statusCode, error, message }` — no stack traces.
- **5:** `MATCHED` (`|ledger − pending − chain| < 1e-6`) at rest and while in-flight.
