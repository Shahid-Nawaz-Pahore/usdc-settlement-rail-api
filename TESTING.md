# TESTING — live verification (Ethereum Sepolia)

Evidence that settlement-rail behaves correctly against the **live** chain, not
just unit tests. Every claim here is reproducible with the harness below.

- **Operator:** `0x645242d9B255A9855aA6196e94bd4d02772747C8`
- **Chain:** Ethereum Sepolia (chainId 11155111)
- **USDC:** `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Circle, 6 dp)
- **Confirmations:** CONFIRMED at 1 block, FINAL at 5 blocks

> **Status:** ⏳ _Awaiting a live run._ The harness and procedure are complete and
> committed. Results below are populated by running `scripts/live-verify.mjs`
> against the funded operator account; each row's tx hash links to Etherscan.
> (Section 1 of the hardening pass requires the funded operator private key in
> `.env` and a running Postgres — neither was available in the build environment,
> so no results are fabricated here.)

## How to reproduce

```bash
# 1. Funded operator key in .env (OPERATOR_PRIVATE_KEY for 0x645242d9…),
#    Postgres up, migrations applied:
npm run db:deploy            # or: npm run db:migrate
# 2. Boot the API and confirm reconciliation is MATCHED at rest:
npm run start:dev
curl -s localhost:3000/reconciliation        # -> "status":"MATCHED"
# 3. In another shell, run the automated harness (tests 1–5, 7):
TEST_RECIPIENT=0xAnExternalChecksummedAddress \
  node --env-file=.env scripts/live-verify.mjs
```

`TEST_RECIPIENT` must be an **external** checksummed address (not the operator,
not a blocklisted one) so the operator's on-chain balance actually decreases and
reconciliation stays meaningful. Total spend is ≤ ~3 USDC.

## Results

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 0 | Reconciliation MATCHED at rest (before tests) | ⏳ | diff `____` |
| 1 | Happy path: 0.5 USDC → SUBMITTED → CONFIRMED → FINAL; ledger booked once | ⏳ | tx `____` |
| 2 | Idempotency under race: same instructionId ×5 → 1 row, 1×201 + 4×200, one transfer | ⏳ | ids=1, codes `____` |
| 3 | Compliance: blocklisted recipient → REJECTED_COMPLIANCE, nothing broadcast | ⏳ | status `____` |
| 4 | Validation: bad address / negative / 7-dp → 400; over-balance → 422; clean error bodies | ⏳ | codes `____` |
| 5 | Reconciliation MATCHED at rest **and** mid-flight (pendingAmount absorbs in-flight) | ⏳ | pending `____` |
| 6 | Restart recovery: kill at SUBMITTED, restart → resumes tracking → FINAL, no manual repair | ⏳ | tx `____` |
| 7 | Concurrency: 5 distinct in parallel → all FINAL, nonces strictly sequential, zero nonce errors | ⏳ | nonces `____` |

## Test 6 — restart recovery (manual procedure)

The harness can't kill its own server, so this one is run by hand:

1. `POST /settlements` a 0.2 USDC settlement.
2. The moment the log prints `Settlement <id> broadcast tx=0x… nonce=…` (status
   SUBMITTED), **kill the backend** (Ctrl-C / `docker compose stop backend`).
3. Restart it (`npm run start:dev`). On boot the relayer's `recoverInFlight`
   loads the SUBMITTED row and reconciles it against the chain:
   - still in mempool → resumes stuck-tx tracking;
   - mined → the listener finalizes it;
   - dropped → re-queued with the **same** stored nonce.
4. Observe the settlement reach `FINAL` with **no manual intervention**, and
   `GET /reconciliation` return MATCHED.

Capture: the pre-restart tx hash, the restart log lines, and the final status.

## What "passing" means per test

- **1, 7:** on-chain receipt `status === 1` at the recorded tx hash; DB `status = FINAL`;
  exactly one DEBIT/CREDIT ledger pair per settlement (no double-booking).
- **2:** `GET /settlements` shows a single row for the instructionId; exactly one tx hash.
- **3:** no `txHash`, terminal `REJECTED_COMPLIANCE`.
- **4:** HTTP 400/422 with body shape `{ statusCode, error, message }` — no stack traces.
- **5:** `MATCHED` while a settlement is SUBMITTED, i.e. `|ledger − pending − chain| < 1e-6`.
- **6:** FINAL after restart with no operator action.
