import { Prisma } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  let prisma: any;
  let chain: any;
  let ledger: any;
  let state: any;
  let service: ReconciliationService;

  beforeEach(() => {
    prisma = {
      reconciliationRun: {
        create: jest.fn((args: any) =>
          Promise.resolve({ id: 'r1', ...args.data }),
        ),
      },
    };
    chain = { getChainBalance: jest.fn() };
    ledger = { getOperatorBalance: jest.fn() };
    state = {};
    const config = { reconCron: '*/5 * * * *' };
    const registry = { addCronJob: jest.fn() };
    // Note: we never call onModuleInit, so no cron is actually scheduled.
    service = new ReconciliationService(
      prisma,
      chain,
      ledger,
      state,
      config as any,
      registry as any,
    );
  });

  // pendingAmount is computed from mined receipts (computeMinedPending); the diff
  // math is what these tests exercise, so we inject the pending value directly.
  const withPending = (value: string) =>
    jest
      .spyOn(service as any, 'computeMinedPending')
      .mockResolvedValue(new Prisma.Decimal(value));

  it('MATCHED when ledger − pending === chain', async () => {
    ledger.getOperatorBalance.mockResolvedValue(new Prisma.Decimal('100'));
    withPending('10');
    chain.getChainBalance.mockResolvedValue(new Prisma.Decimal('90'));

    const run = await service.run();
    expect(run.status).toBe('MATCHED');
    expect(run.diff.toString()).toBe('0');
  });

  it('MISMATCH when balances diverge beyond epsilon', async () => {
    ledger.getOperatorBalance.mockResolvedValue(new Prisma.Decimal('100'));
    withPending('10');
    chain.getChainBalance.mockResolvedValue(new Prisma.Decimal('80'));

    const run = await service.run();
    expect(run.status).toBe('MISMATCH');
    // 100 − 10 − 80 = 10
    expect(run.diff.toString()).toBe('10');
  });

  it('MATCHED within sub-micro tolerance (rounding noise)', async () => {
    ledger.getOperatorBalance.mockResolvedValue(
      new Prisma.Decimal('100.0000005'),
    );
    withPending('10');
    chain.getChainBalance.mockResolvedValue(new Prisma.Decimal('90'));

    const run = await service.run();
    expect(run.status).toBe('MATCHED');
  });
});
