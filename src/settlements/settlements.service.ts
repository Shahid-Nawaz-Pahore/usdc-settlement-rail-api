import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Settlement, SettlementStatus } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service';
import { RelayerService } from '../relayer/relayer.service';
import { COMPLIANCE_PROVIDER } from '../compliance/compliance.interface';
import type { IComplianceProvider } from '../compliance/compliance.interface';
import {
  IN_FLIGHT_STATUSES,
  SettlementStateService,
} from '../settlement-state/settlement-state.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';

export interface BalanceView {
  operatorBalance: string;
  inFlightAmount: string;
  availableBalance: string;
}

export interface CreateResult {
  settlement: Settlement;
  /** false when an existing instructionId was returned (idempotent hit). */
  created: boolean;
}

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly state: SettlementStateService,
    private readonly ledger: LedgerService,
    private readonly relayer: RelayerService,
    @Inject(COMPLIANCE_PROVIDER)
    private readonly compliance: IComplianceProvider,
  ) {}

  /**
   * Submission path. Idempotent on instructionId; rejects (422) if the amount
   * exceeds available balance; screens compliance; enqueues approved settlements.
   */
  async create(dto: CreateSettlementDto): Promise<CreateResult> {
    // Fast-path idempotency: return the existing record unchanged.
    const existing = await this.state.findByInstructionId(dto.instructionId);
    if (existing) {
      this.logger.log(
        `Idempotent hit instructionId=${dto.instructionId} -> ${existing.id}`,
      );
      return { settlement: existing, created: false };
    }

    const amount = new Prisma.Decimal(dto.amount);
    const available = await this.availableBalance();
    if (amount.gt(available)) {
      throw new UnprocessableEntityException({
        error: 'InsufficientBalance',
        message: `amount ${amount.toString()} exceeds available balance ${available.toString()}`,
      });
    }

    let settlement: Settlement;
    try {
      settlement = await this.state.create({
        instructionId: dto.instructionId,
        toAddress: dto.toAddress,
        amount,
        status: SettlementStatus.RECEIVED,
      });
    } catch (err) {
      // Race: a concurrent request created the same instructionId first.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.state.findByInstructionId(dto.instructionId);
        if (raced) return { settlement: raced, created: false };
      }
      throw err;
    }

    // Compliance screening.
    const result = await this.compliance.check(dto.toAddress);
    if (!result.approved) {
      const rejected = await this.state.transition(
        settlement.id,
        SettlementStatus.REJECTED_COMPLIANCE,
        { failureReason: result.reason ?? 'COMPLIANCE_REJECTED' },
      );
      return { settlement: rejected ?? settlement, created: true };
    }

    const approved = await this.state.transition(
      settlement.id,
      SettlementStatus.COMPLIANCE_APPROVED,
    );
    const ready = approved ?? settlement;
    this.relayer.enqueue(ready);
    return { settlement: ready, created: true };
  }

  async getById(id: string): Promise<Settlement> {
    const settlement = await this.state.findById(id);
    if (!settlement) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }
    return settlement;
  }

  list(): Promise<Settlement[]> {
    return this.state.listRecent();
  }

  /** Ledger balance minus everything in-flight (not yet finalized in the ledger). */
  async availableBalance(): Promise<Prisma.Decimal> {
    const [operatorBalance, inFlight] = await Promise.all([
      this.ledger.getOperatorBalance(),
      this.state.sumByStatuses(IN_FLIGHT_STATUSES),
    ]);
    return operatorBalance.minus(inFlight);
  }

  async balanceView(): Promise<BalanceView> {
    const [operatorBalance, inFlight] = await Promise.all([
      this.ledger.getOperatorBalance(),
      this.state.sumByStatuses(IN_FLIGHT_STATUSES),
    ]);
    return {
      operatorBalance: operatorBalance.toString(),
      inFlightAmount: inFlight.toString(),
      availableBalance: operatorBalance.minus(inFlight).toString(),
    };
  }
}
