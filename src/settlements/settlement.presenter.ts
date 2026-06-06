import { Injectable } from '@nestjs/common';
import { Settlement, SettlementStatus } from '@prisma/client';
import { ChainService } from '../chain/chain.service';

export interface SettlementResponse {
  id: string;
  instructionId: string;
  toAddress: string;
  amount: string;
  status: SettlementStatus;
  txHash: string | null;
  nonce: number | null;
  failureReason: string | null;
  retryCount: number;
  /** Block confirmations for in-flight settlements; null otherwise. */
  confirmations: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const IN_FLIGHT = new Set<SettlementStatus>([
  SettlementStatus.SUBMITTED,
  SettlementStatus.CONFIRMED,
]);

/**
 * Shapes Settlement rows into API responses, enriching in-flight ones with a
 * live confirmation count (computed from the receipt's block depth).
 */
@Injectable()
export class SettlementPresenter {
  constructor(private readonly chain: ChainService) {}

  async present(settlement: Settlement): Promise<SettlementResponse> {
    const [one] = await this.presentMany([settlement]);
    return one;
  }

  async presentMany(settlements: Settlement[]): Promise<SettlementResponse[]> {
    const needsConfirmations = settlements.filter(
      (s) => IN_FLIGHT.has(s.status) && s.txHash,
    );

    const confirmationsById = new Map<string, number>();
    if (needsConfirmations.length > 0) {
      const currentBlock = await this.chain.getCurrentBlock();
      await Promise.all(
        needsConfirmations.map(async (s) => {
          const receipt = await this.chain
            .getProvider()
            .getTransactionReceipt(s.txHash as string);
          confirmationsById.set(
            s.id,
            receipt ? currentBlock - receipt.blockNumber + 1 : 0,
          );
        }),
      );
    }

    return settlements.map((s) => ({
      id: s.id,
      instructionId: s.instructionId,
      toAddress: s.toAddress,
      amount: s.amount.toString(),
      status: s.status,
      txHash: s.txHash,
      nonce: s.nonce,
      failureReason: s.failureReason,
      retryCount: s.retryCount,
      confirmations: IN_FLIGHT.has(s.status)
        ? (confirmationsById.get(s.id) ?? 0)
        : null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }
}
