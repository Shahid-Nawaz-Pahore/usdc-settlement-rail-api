import { Prisma, SettlementStatus } from '@prisma/client';
import { SettlementsService } from './settlements.service';

describe('SettlementsService', () => {
  let state: any;
  let ledger: any;
  let relayer: any;
  let compliance: any;
  let service: SettlementsService;

  const dto = {
    instructionId: 'instr-1',
    toAddress: '0x1111111111111111111111111111111111111111',
    amount: '25',
  };

  beforeEach(() => {
    state = {
      findByInstructionId: jest.fn(),
      findById: jest.fn(),
      getTransitions: jest.fn(),
      create: jest.fn(),
      transition: jest.fn(),
      sumByStatuses: jest.fn().mockResolvedValue(new Prisma.Decimal('0')),
    };
    ledger = {
      getOperatorBalance: jest
        .fn()
        .mockResolvedValue(new Prisma.Decimal('1000')),
    };
    relayer = { enqueue: jest.fn() };
    compliance = { check: jest.fn().mockResolvedValue({ approved: true }) };
    service = new SettlementsService(state, ledger, relayer, compliance);
  });

  it('idempotent double-POST returns the same record and enqueues only once', async () => {
    const created = {
      id: 's1',
      instructionId: dto.instructionId,
      status: SettlementStatus.COMPLIANCE_APPROVED,
    };
    // First call: not found -> create flow. Second call: found -> idempotent hit.
    state.findByInstructionId
      .mockResolvedValueOnce(null)
      .mockResolvedValue(created);
    state.create.mockResolvedValue({
      id: 's1',
      instructionId: dto.instructionId,
      status: SettlementStatus.RECEIVED,
    });
    state.transition.mockResolvedValue(created);

    const first = await service.create(dto);
    const second = await service.create(dto);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.settlement.id).toBe(second.settlement.id);
    expect(relayer.enqueue).toHaveBeenCalledTimes(1); // not enqueued again
  });

  it('rejects (422) when amount exceeds available balance', async () => {
    state.findByInstructionId.mockResolvedValue(null);
    ledger.getOperatorBalance.mockResolvedValue(new Prisma.Decimal('10'));
    state.sumByStatuses.mockResolvedValue(new Prisma.Decimal('0'));

    await expect(service.create(dto as any)).rejects.toMatchObject({
      status: 422,
    });
    expect(relayer.enqueue).not.toHaveBeenCalled();
  });

  it('blocked address is REJECTED_COMPLIANCE and never enqueued', async () => {
    state.findByInstructionId.mockResolvedValue(null);
    state.create.mockResolvedValue({
      id: 's2',
      status: SettlementStatus.RECEIVED,
    });
    compliance.check.mockResolvedValue({
      approved: false,
      reason: 'ADDRESS_BLOCKLISTED',
    });
    state.transition.mockResolvedValue({
      id: 's2',
      status: SettlementStatus.REJECTED_COMPLIANCE,
    });

    const result = await service.create(dto);
    expect(result.settlement.status).toBe(SettlementStatus.REJECTED_COMPLIANCE);
    expect(relayer.enqueue).not.toHaveBeenCalled();
  });

  describe('getTransitions', () => {
    it('returns the settlement transition rows (ordered as stored)', async () => {
      const rows = [
        { id: 't1', fromStatus: 'RECEIVED', toStatus: 'COMPLIANCE_APPROVED' },
        { id: 't2', fromStatus: 'COMPLIANCE_APPROVED', toStatus: 'SUBMITTED' },
      ];
      state.findById.mockResolvedValue({ id: 's1' });
      state.getTransitions.mockResolvedValue(rows);

      const result = await service.getTransitions('s1');

      expect(state.getTransitions).toHaveBeenCalledWith('s1');
      expect(result).toEqual(rows);
    });

    it('throws 404 when the settlement does not exist', async () => {
      state.findById.mockResolvedValue(null);

      await expect(service.getTransitions('missing')).rejects.toMatchObject({
        status: 404,
      });
      expect(state.getTransitions).not.toHaveBeenCalled();
    });
  });
});
