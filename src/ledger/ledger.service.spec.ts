import { Prisma } from '@prisma/client';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  let prisma: any;
  let chain: any;
  let ledger: LedgerService;

  beforeEach(() => {
    prisma = {
      ledgerEntry: {
        create: jest.fn((args: any) => args),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
      },
      settlement: { upsert: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    chain = {
      getChainBalance: jest.fn(),
      getOperatorAddress: jest.fn().mockReturnValue('0xoperator'),
    };
    ledger = new LedgerService(prisma, chain);
  });

  describe('recordSettlementFinalized', () => {
    it('writes a balanced DEBIT/CREDIT pair (sum of debits === sum of credits)', async () => {
      const ok = await ledger.recordSettlementFinalized('s1', '12.5');
      expect(ok).toBe(true);

      const [first, second] = prisma.ledgerEntry.create.mock.calls.map(
        (c: any[]) => c[0].data,
      );
      const debit = [first, second].find((d) => d.direction === 'DEBIT');
      const credit = [first, second].find((d) => d.direction === 'CREDIT');

      expect(debit.account).toBe('OPERATOR');
      expect(credit.account).toBe('SETTLED_OUT');
      expect(debit.amount.toString()).toBe('12.5');
      expect(credit.amount.toString()).toBe('12.5');
      // Double-entry invariant: debits balance credits.
      expect(debit.amount.minus(credit.amount).toString()).toBe('0');
    });

    it('is idempotent — a duplicate booking (P2002) returns false, not an error', async () => {
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dupe', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const ok = await ledger.recordSettlementFinalized('s1', '12.5');
      expect(ok).toBe(false);
    });

    it('rethrows non-unique errors', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
      await expect(
        ledger.recordSettlementFinalized('s1', '12.5'),
      ).rejects.toThrow('db down');
    });
  });

  describe('getOperatorBalance', () => {
    it('computes opening + credits − debits', async () => {
      prisma.ledgerEntry.findFirst.mockResolvedValue({
        amount: new Prisma.Decimal('100'),
      });
      prisma.ledgerEntry.aggregate
        .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('0') } }) // credits
        .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('30') } }); // debits

      const balance = await ledger.getOperatorBalance();
      expect(balance.toString()).toBe('70');
    });
  });
});
