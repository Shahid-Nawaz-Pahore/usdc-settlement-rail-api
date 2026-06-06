import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Settlement, SettlementStatus } from '@prisma/client';
import { parseUnits } from 'ethers';
import { ChainService } from '../chain/chain.service';
import { AppConfigService } from '../config/app-config.service';
import { SettlementStateService } from '../settlement-state/settlement-state.service';
import { Mutex } from './mutex';
import { classifyTxError } from './tx-error';

interface Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

interface InflightTx extends Fees {
  settlementId: string;
  nonce: number;
  gasLimit: bigint;
  lastSubmittedAt: number;
  attempts: number;
}

const FALLBACK_GAS_LIMIT = 120_000n;

/**
 * Self-built relayer. A single worker drains an in-process FIFO queue and sends
 * exactly one USDC transfer at a time from the operator wallet.
 *
 * WHY strictly sequential / single-in-flight: every transaction from one EOA
 * must carry a strictly increasing nonce. If we sent concurrently we'd have to
 * guess nonces and any gap or reuse would wedge the whole account. So we fetch
 * the pending nonce ONCE at boot, track it locally, and increment per accepted
 * broadcast. A mutex guarantees no two broadcasts (new sends OR gas-bump
 * resends) ever interleave.
 */
@Injectable()
export class RelayerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RelayerService.name);

  private readonly queue: string[] = [];
  private readonly inflight = new Map<string, InflightTx>();
  private readonly sendLock = new Mutex();

  private localNonce = 0;
  private workerRunning = false;
  private draining = false;

  constructor(
    private readonly chain: ChainService,
    private readonly config: AppConfigService,
    private readonly state: SettlementStateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.localNonce = await this.chain
      .getProvider()
      .getTransactionCount(this.chain.getOperatorAddress(), 'pending');
    this.logger.log(`Relayer starting — pending nonce=${this.localNonce}`);
    await this.recoverInFlight();
  }

  onModuleDestroy(): void {
    // Graceful shutdown: stop picking up new work; in-flight txs are tracked on
    // chain and recovered on next boot.
    this.draining = true;
    this.logger.log('Relayer draining — no new jobs will be processed');
  }

  // ---- Public API ---------------------------------------------------------

  /** Add an already COMPLIANCE_APPROVED settlement to the send queue. */
  enqueue(settlement: Settlement): void {
    this.enqueueId(settlement.id);
  }

  private enqueueId(id: string): void {
    if (this.draining) return;
    this.queue.push(id);
    void this.runWorker();
  }

  // ---- Worker loop --------------------------------------------------------

  private async runWorker(): Promise<void> {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      while (this.queue.length > 0 && !this.draining) {
        const id = this.queue.shift() as string;
        try {
          await this.processJob(id);
        } catch (err) {
          this.logger.error(
            `Unhandled error processing settlement=${id}: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private async processJob(id: string): Promise<void> {
    const settlement = await this.state.findById(id);
    if (!settlement) {
      this.logger.warn(`Job ${id} not found — skipping`);
      return;
    }
    // Fresh jobs are COMPLIANCE_APPROVED; recovery re-queues SUBMITTED (resume).
    if (
      settlement.status !== SettlementStatus.COMPLIANCE_APPROVED &&
      settlement.status !== SettlementStatus.SUBMITTED
    ) {
      this.logger.warn(
        `Job ${id} in status ${settlement.status} — not sendable, skipping`,
      );
      return;
    }

    const isResume =
      settlement.status === SettlementStatus.SUBMITTED &&
      settlement.nonce !== null;
    let nonce = isResume ? (settlement.nonce as number) : this.localNonce;

    const baseUnits = this.chain.toBaseUnits(settlement.amount);
    const gasLimit = await this.estimateGas(settlement.toAddress, baseUnits);
    let fees = await this.buildFees();
    let retryCount = settlement.retryCount;
    const maxRetries = this.config.maxRetries;

    for (let attempt = 0; ; attempt++) {
      try {
        const tx = await this.broadcast(
          settlement.toAddress,
          baseUnits,
          nonce,
          gasLimit,
          fees,
        );

        if (!isResume && nonce === this.localNonce) {
          this.localNonce += 1; // consume the nonce only on accepted broadcast
        }

        this.inflight.set(id, {
          settlementId: id,
          nonce,
          gasLimit,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          lastSubmittedAt: Date.now(),
          attempts: retryCount,
        });

        await this.state.transition(id, SettlementStatus.SUBMITTED, {
          txHash: tx.hash,
          nonce,
          retryCount,
        });
        this.logger.log(
          `Settlement ${id} broadcast tx=${tx.hash} nonce=${nonce} amount=${settlement.amount.toString()}`,
        );
        return;
      } catch (err) {
        const cls = classifyTxError(err);
        this.logger.warn(
          `Send failed settlement=${id} attempt=${attempt} class=${cls.reason} retryable=${cls.retryable}: ${(err as Error).message}`,
        );

        if (!cls.retryable) {
          await this.fail(id, cls.reason, retryCount);
          return;
        }

        retryCount += 1;
        if (retryCount > maxRetries) {
          await this.fail(id, `MAX_RETRIES_EXCEEDED:${cls.reason}`, retryCount);
          return;
        }

        if (cls.resyncNonce) {
          const fresh = await this.chain
            .getProvider()
            .getTransactionCount(this.chain.getOperatorAddress(), 'pending');
          if (!isResume) {
            this.localNonce = fresh;
            nonce = fresh;
          }
        }
        if (cls.reason === 'UNDERPRICED') {
          fees = bumpFees(fees);
        }
        await sleep(backoffMs(attempt));
      }
    }
  }

  // ---- Stuck-tx sweep (called by StuckTxWatcher on an interval) ------------

  async sweepStuckTransactions(): Promise<void> {
    if (this.draining) return;
    const submitted = await this.state.findByStatuses([
      SettlementStatus.SUBMITTED,
    ]);
    const thresholdMs = this.config.stuckTxSeconds * 1000;

    for (const s of submitted) {
      if (!s.txHash || s.nonce === null) continue;

      const receipt = await this.chain
        .getProvider()
        .getTransactionReceipt(s.txHash);
      if (receipt) {
        // Mined — the chain-listener owns its progression to CONFIRMED/FINAL.
        this.inflight.delete(s.id);
        continue;
      }

      const info = this.inflight.get(s.id);
      const lastAt = info?.lastSubmittedAt ?? s.updatedAt.getTime();
      if (Date.now() - lastAt < thresholdMs) continue;

      if (s.retryCount >= this.config.maxRetries) {
        await this.fail(s.id, 'STUCK_MAX_RETRIES', s.retryCount);
        this.inflight.delete(s.id);
        continue;
      }

      await this.bumpAndResend(s, info);
    }
  }

  /** Re-broadcast a stuck tx with the SAME nonce and +25% fees. */
  private async bumpAndResend(
    s: Settlement,
    info: InflightTx | undefined,
  ): Promise<void> {
    const nonce = s.nonce as number;
    const prevFees: Fees = info
      ? {
          maxFeePerGas: info.maxFeePerGas,
          maxPriorityFeePerGas: info.maxPriorityFeePerGas,
        }
      : ((await this.feesFromTx(s.txHash as string)) ??
        (await this.buildFees()));
    const fees = bumpFees(prevFees);
    const gasLimit =
      info?.gasLimit ??
      (await this.estimateGas(s.toAddress, this.chain.toBaseUnits(s.amount)));
    const newRetry = s.retryCount + 1;

    try {
      const tx = await this.broadcast(
        s.toAddress,
        this.chain.toBaseUnits(s.amount),
        nonce,
        gasLimit,
        fees,
      );
      this.inflight.set(s.id, {
        settlementId: s.id,
        nonce,
        gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        lastSubmittedAt: Date.now(),
        attempts: newRetry,
      });
      await this.state.recordResend(s.id, tx.hash, newRetry);
      this.logger.warn(
        `Gas-bumped resend settlement=${s.id} nonce=${nonce} newTx=${tx.hash} ` +
          `maxFee=${fees.maxFeePerGas} prio=${fees.maxPriorityFeePerGas}`,
      );
    } catch (err) {
      const cls = classifyTxError(err);
      // "already known"/nonce errors here usually mean the original just mined.
      if (cls.resyncNonce) {
        this.logger.log(
          `Resend for ${s.id} hit ${cls.reason} — original likely mined; leaving to listener`,
        );
        return;
      }
      if (!cls.retryable) {
        await this.fail(s.id, `RESEND_${cls.reason}`, newRetry);
        return;
      }
      this.logger.warn(
        `Resend for ${s.id} failed (${cls.reason}) — will retry next sweep`,
      );
    }
  }

  // ---- Restart recovery ---------------------------------------------------

  private async recoverInFlight(): Promise<void> {
    const submitted = await this.state.findByStatuses([
      SettlementStatus.SUBMITTED,
    ]);
    if (submitted.length === 0) return;
    this.logger.log(`Recovering ${submitted.length} SUBMITTED settlement(s)`);

    for (const s of submitted) {
      if (!s.txHash) {
        // Never got a hash before crash — re-queue to (re)send.
        this.enqueueId(s.id);
        continue;
      }
      const receipt = await this.chain
        .getProvider()
        .getTransactionReceipt(s.txHash);
      if (receipt) {
        if (receipt.status === 0) {
          await this.fail(s.id, 'REVERTED_ON_RECOVERY', s.retryCount);
        }
        // status 1: mined — chain-listener will finalize. Nothing to track.
        continue;
      }
      const tx = await this.chain.getProvider().getTransaction(s.txHash);
      if (tx) {
        // Still pending in the mempool — resume stuck-tx tracking.
        this.inflight.set(s.id, {
          settlementId: s.id,
          nonce: s.nonce ?? tx.nonce,
          gasLimit: tx.gasLimit ?? FALLBACK_GAS_LIMIT,
          maxFeePerGas: tx.maxFeePerGas ?? 0n,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 0n,
          lastSubmittedAt: Date.now(),
          attempts: s.retryCount,
        });
        this.logger.log(`Resumed tracking pending tx=${s.txHash} for ${s.id}`);
      } else {
        // Dropped from the mempool — re-queue to resend with the stored nonce.
        this.logger.warn(`tx=${s.txHash} dropped — re-queueing ${s.id}`);
        this.enqueueId(s.id);
      }
    }
  }

  // ---- Low-level helpers --------------------------------------------------

  private broadcast(
    to: string,
    baseUnits: bigint,
    nonce: number,
    gasLimit: bigint,
    fees: Fees,
  ): Promise<{ hash: string }> {
    // Serialised so only one broadcast is ever in flight from the wallet.
    return this.sendLock.runExclusive(async () => {
      const contract = this.chain.getUsdcWriteContract();
      const tx = (await contract.transfer(to, baseUnits, {
        nonce,
        gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      })) as { hash: string };
      return { hash: tx.hash };
    });
  }

  private async estimateGas(to: string, baseUnits: bigint): Promise<bigint> {
    try {
      const est = await this.chain
        .getUsdcWriteContract()
        .transfer.estimateGas(to, baseUnits);
      return (est * 120n) / 100n; // 20% headroom
    } catch {
      return FALLBACK_GAS_LIMIT;
    }
  }

  private async buildFees(): Promise<Fees> {
    const fd = await this.chain.getProvider().getFeeData();
    const maxPriorityFeePerGas =
      fd.maxPriorityFeePerGas ?? parseUnits('1', 'gwei');
    const maxFeePerGas = fd.maxFeePerGas ?? maxPriorityFeePerGas * 2n;
    return { maxFeePerGas, maxPriorityFeePerGas };
  }

  private async feesFromTx(txHash: string): Promise<Fees | null> {
    const tx = await this.chain.getProvider().getTransaction(txHash);
    if (tx?.maxFeePerGas && tx.maxPriorityFeePerGas) {
      return {
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      };
    }
    return null;
  }

  private async fail(
    id: string,
    reason: string,
    retryCount: number,
  ): Promise<void> {
    this.inflight.delete(id);
    await this.state.transition(id, SettlementStatus.FAILED, {
      failureReason: reason,
      retryCount,
    });
    this.logger.error(`Settlement ${id} FAILED: ${reason}`);
  }
}

function bumpFees(fees: Fees): Fees {
  return {
    maxFeePerGas: (fees.maxFeePerGas * 125n) / 100n,
    maxPriorityFeePerGas: (fees.maxPriorityFeePerGas * 125n) / 100n,
  };
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
