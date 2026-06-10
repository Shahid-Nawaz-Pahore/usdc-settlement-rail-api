import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Contract, keccak256, toUtf8Bytes } from 'ethers';
import { ChainService } from '../chain/chain.service';
import { AppConfigService } from '../config/app-config.service';
import { DVP_ESCROW_ABI, ERC20_APPROVE_ABI, DVP_STATE } from './dvp-escrow.abi';
import { CreateDvpDto } from './dto/create-dvp.dto';

/**
 * Delivery-vs-Payment via the on-chain DvPEscrow. The operator is both the
 * funder (depositor) and the authorized settler: it funds USDC into escrow,
 * then releases to the beneficiary only once the settlement condition is met —
 * or the deal is refunded on timeout/cancel. Conditional release is the DvP
 * guarantee: funds move to the beneficiary only on an explicit settler action.
 */
@Injectable()
export class DvpService {
  private readonly logger = new Logger(DvpService.name);

  constructor(
    private readonly chain: ChainService,
    private readonly config: AppConfigService,
  ) {}

  private escrowAddress(): string {
    const addr = this.config.dvpEscrowAddress;
    if (!addr) {
      throw new ServiceUnavailableException(
        'DvP escrow not configured (DVP_ESCROW_ADDRESS unset)',
      );
    }
    return addr;
  }

  private escrow(): Contract {
    return new Contract(
      this.escrowAddress(),
      DVP_ESCROW_ABI,
      this.chain.getWallet(),
    );
  }

  private usdc(): Contract {
    return new Contract(
      this.config.usdcContractAddress,
      ERC20_APPROVE_ABI,
      this.chain.getWallet(),
    );
  }

  /** Deterministic bytes32 deal id from the instruction id (idempotent). */
  dealId(instructionId: string): string {
    return keccak256(toUtf8Bytes(instructionId));
  }

  /** Approve (if needed) then fund the escrow — the "delivery is locked" leg. */
  async fund(dto: CreateDvpDto) {
    const escrow = this.escrow();
    const usdc = this.usdc();
    const escrowAddr = this.escrowAddress();
    const operator = this.chain.getOperatorAddress();
    const dealId = this.dealId(dto.instructionId);
    const amount = this.chain.toBaseUnits(dto.amount);
    // Base the deadline on CHAIN time (block.timestamp), not the local clock —
    // the contract compares against block.timestamp, and node/chain clocks skew.
    const latest = await this.chain.getProvider().getBlock('latest');
    const baseTime = latest
      ? Number(latest.timestamp)
      : Math.floor(Date.now() / 1000);
    const deadline = baseTime + (dto.deadlineSeconds ?? 3600);

    let approveTx: string | undefined;
    const allowance = (await usdc.allowance(operator, escrowAddr)) as bigint;
    if (allowance < amount) {
      const tx = (await usdc.approve(escrowAddr, amount)) as {
        hash: string;
        wait: (n: number) => Promise<unknown>;
      };
      approveTx = tx.hash;
      await tx.wait(1);
    }

    const fundTx = (await escrow.fund(
      dealId,
      dto.beneficiary,
      amount,
      deadline,
    )) as { hash: string; wait: (n: number) => Promise<unknown> };
    await fundTx.wait(1); // funded before release is allowed

    this.logger.log(`DvP funded deal=${dealId} tx=${fundTx.hash}`);
    return {
      instructionId: dto.instructionId,
      dealId,
      beneficiary: dto.beneficiary,
      amount: dto.amount,
      deadline,
      status: 'Funded',
      approveTx,
      fundTx: fundTx.hash,
    };
  }

  /** Settler releases the escrowed USDC to the beneficiary (condition met). */
  async release(instructionId: string) {
    const escrow = this.escrow();
    const dealId = this.dealId(instructionId);
    const tx = (await escrow.release(dealId)) as {
      hash: string;
      wait: (n: number) => Promise<unknown>;
    };
    await tx.wait(1);
    this.logger.log(`DvP released deal=${dealId} tx=${tx.hash}`);
    return { instructionId, dealId, status: 'Released', releaseTx: tx.hash };
  }

  /** Read the deal state straight from the escrow (the source of truth). */
  async getDeal(instructionId: string) {
    const escrow = this.escrow();
    const dealId = this.dealId(instructionId);
    const d = (await escrow.getDeal(dealId)) as {
      depositor: string;
      beneficiary: string;
      amount: bigint;
      deadline: bigint;
      state: bigint;
    };
    return {
      instructionId,
      dealId,
      depositor: d.depositor,
      beneficiary: d.beneficiary,
      amount: this.chain.fromBaseUnits(d.amount).toString(),
      deadline: Number(d.deadline),
      state: DVP_STATE[Number(d.state)] ?? 'Unknown',
    };
  }
}
