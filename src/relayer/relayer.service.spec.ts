import { Prisma, SettlementStatus } from '@prisma/client';
import { RelayerService } from './relayer.service';

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setImmediate(r));
  }
}

function buildChain(startNonce: number) {
  const transfer: any = jest.fn(
    async (_to: string, _amt: bigint, overrides: any) => ({
      hash: `0xhash${overrides.nonce}`,
    }),
  );
  transfer.estimateGas = jest.fn().mockResolvedValue(60_000n);

  const provider = {
    getTransactionCount: jest.fn().mockResolvedValue(startNonce),
    getFeeData: jest.fn().mockResolvedValue({
      maxFeePerGas: 1_000n,
      maxPriorityFeePerGas: 100n,
    }),
    getTransactionReceipt: jest.fn(),
    getTransaction: jest.fn(),
  };

  const chain = {
    getProvider: jest.fn().mockReturnValue(provider),
    getOperatorAddress: jest.fn().mockReturnValue('0xoperator'),
    getUsdcWriteContract: jest.fn().mockReturnValue({ transfer }),
    toBaseUnits: jest.fn().mockReturnValue(1_000_000n),
  };

  return { chain, provider, transfer };
}

function buildState(seed: Record<string, any>) {
  const store = new Map<string, any>(Object.entries(seed));
  return {
    store,
    findById: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
    findByStatuses: jest.fn((statuses: SettlementStatus[]) =>
      Promise.resolve(
        [...store.values()].filter((s) => statuses.includes(s.status)),
      ),
    ),
    transition: jest.fn(
      (id: string, status: SettlementStatus, opts: any = {}) => {
        const s = store.get(id);
        Object.assign(s, { status, ...opts });
        return Promise.resolve(s);
      },
    ),
    recordResend: jest.fn((id: string, txHash: string, retryCount: number) => {
      const s = store.get(id);
      Object.assign(s, { txHash, retryCount });
      return Promise.resolve(s);
    }),
  };
}

const config = { maxRetries: 3, stuckTxSeconds: 60 } as any;
const metrics = {
  broadcasts: { inc: jest.fn() },
  queueDepth: { set: jest.fn() },
} as any;

describe('RelayerService', () => {
  it('assigns strictly increasing, contiguous nonces across concurrent enqueues', async () => {
    const { chain, transfer } = buildChain(5);
    const seed = {
      s1: settlement('s1'),
      s2: settlement('s2'),
      s3: settlement('s3'),
    };
    const state = buildState(seed);
    const relayer = new RelayerService(
      chain as any,
      config,
      state as any,
      metrics,
    );

    await relayer.onApplicationBootstrap(); // fetches pending nonce = 5

    // Enqueue "concurrently" (synchronously, before the worker drains).
    relayer.enqueue(seed.s1 as any);
    relayer.enqueue(seed.s2 as any);
    relayer.enqueue(seed.s3 as any);

    await waitFor(() => transfer.mock.calls.length === 3);

    const nonces = transfer.mock.calls.map((c: any[]) => c[2].nonce);
    expect(nonces).toEqual([5, 6, 7]); // single worker, sequential nonce
  });

  it('stuck tx is resent with the SAME nonce and +25% fees', async () => {
    const { chain, provider, transfer } = buildChain(8);
    const stuck = {
      id: 'stuck1',
      toAddress: '0xrecipient',
      amount: new Prisma.Decimal('5'),
      status: SettlementStatus.SUBMITTED,
      txHash: '0xold',
      nonce: 7,
      retryCount: 0,
      updatedAt: new Date(Date.now() - 5 * 60_000), // 5 min ago -> stale
    };
    const state = buildState({ stuck1: stuck });

    // Not mined yet; original tx still in mempool with known fees.
    provider.getTransactionReceipt.mockResolvedValue(null);
    provider.getTransaction.mockResolvedValue({
      maxFeePerGas: 1_000n,
      maxPriorityFeePerGas: 100n,
      gasLimit: 60_000n,
      nonce: 7,
    });

    const relayer = new RelayerService(
      chain as any,
      config,
      state as any,
      metrics,
    );
    await relayer.sweepStuckTransactions();

    expect(transfer).toHaveBeenCalledTimes(1);
    const overrides = transfer.mock.calls[0][2];
    expect(overrides.nonce).toBe(7); // same nonce, replacement tx
    expect(overrides.maxFeePerGas).toBe(1_250n); // 1000 * 1.25
    expect(overrides.maxPriorityFeePerGas).toBe(125n); // 100 * 1.25
    expect(state.recordResend).toHaveBeenCalledWith('stuck1', '0xhash7', 1);
  });

  it('stuck tx already at MAX_RETRIES is marked FAILED, not resent', async () => {
    const { chain, provider, transfer } = buildChain(8);
    const stuck = {
      id: 'stuck2',
      toAddress: '0xrecipient',
      amount: new Prisma.Decimal('5'),
      status: SettlementStatus.SUBMITTED,
      txHash: '0xold',
      nonce: 7,
      retryCount: 3, // == maxRetries
      updatedAt: new Date(Date.now() - 5 * 60_000),
    };
    const state = buildState({ stuck2: stuck });
    provider.getTransactionReceipt.mockResolvedValue(null);

    const relayer = new RelayerService(
      chain as any,
      config,
      state as any,
      metrics,
    );
    await relayer.sweepStuckTransactions();

    expect(transfer).not.toHaveBeenCalled();
    expect(state.transition).toHaveBeenCalledWith(
      'stuck2',
      SettlementStatus.FAILED,
      expect.objectContaining({ failureReason: 'STUCK_MAX_RETRIES' }),
    );
  });
});

function settlement(id: string) {
  return {
    id,
    toAddress: '0xrecipient',
    amount: new Prisma.Decimal('5'),
    status: SettlementStatus.COMPLIANCE_APPROVED,
    txHash: null,
    nonce: null,
    retryCount: 0,
    updatedAt: new Date(),
  };
}
