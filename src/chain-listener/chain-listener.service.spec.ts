import { SettlementStatus } from '@prisma/client';
import { ChainListenerService } from './chain-listener.service';

function build() {
  const provider = { getTransactionReceipt: jest.fn() };
  const chain = { getProvider: jest.fn().mockReturnValue(provider) };
  const state = { transition: jest.fn().mockResolvedValue({}) };
  const ledger = {
    recordSettlementFinalized: jest.fn().mockResolvedValue(true),
  };
  const metrics = { reorgs: { inc: jest.fn() }, gasWei: { inc: jest.fn() } };
  const config = { confirmationsConfirmed: 1, confirmationsFinal: 5 } as any;
  const listener = new ChainListenerService(
    chain as any,
    config,
    state as any,
    ledger as any,
    metrics as any,
  );
  // processReceipt is private; invoke it directly for focused unit testing.
  const processReceipt = (settlement: any, currentBlock: number) =>
    (listener as any).processReceipt(settlement, currentBlock);
  return { provider, state, metrics, processReceipt };
}

const confirmed = (over: any = {}) => ({
  id: 's1',
  txHash: '0xtx',
  status: SettlementStatus.CONFIRMED,
  confirmedBlockHash: '0xAAA',
  confirmedBlockNumber: 100,
  amount: '1',
  ...over,
});

describe('ChainListenerService reorg handling', () => {
  it('reverts to SUBMITTED when the tx block hash changes (reorg)', async () => {
    const { provider, state, metrics, processReceipt } = build();
    provider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockHash: '0xBBB', // different from recorded 0xAAA
      blockNumber: 100,
    });

    await processReceipt(confirmed(), 101);

    expect(metrics.reorgs.inc).toHaveBeenCalledTimes(1);
    expect(state.transition).toHaveBeenCalledWith(
      's1',
      SettlementStatus.SUBMITTED,
      expect.objectContaining({
        confirmedBlockHash: null,
        confirmedBlockNumber: null,
        expectedFrom: [SettlementStatus.CONFIRMED],
      }),
    );
  });

  it('reverts to SUBMITTED when a confirmed tx vanishes from the chain', async () => {
    const { provider, state, metrics, processReceipt } = build();
    provider.getTransactionReceipt.mockResolvedValue(null);

    await processReceipt(confirmed(), 105);

    expect(metrics.reorgs.inc).toHaveBeenCalledTimes(1);
    expect(state.transition).toHaveBeenCalledWith(
      's1',
      SettlementStatus.SUBMITTED,
      expect.objectContaining({ confirmedBlockHash: null }),
    );
  });

  it('does NOT flag a reorg when the block hash is unchanged', async () => {
    const { provider, state, metrics, processReceipt } = build();
    provider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockHash: '0xAAA', // same as recorded
      blockNumber: 100,
    });

    await processReceipt(confirmed(), 102); // 3 confs, below final (5)

    expect(metrics.reorgs.inc).not.toHaveBeenCalled();
    expect(state.transition).not.toHaveBeenCalled();
  });

  it('records the confirmation block on first CONFIRMED', async () => {
    const { provider, state, processReceipt } = build();
    provider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockHash: '0xAAA',
      blockNumber: 100,
    });

    await processReceipt(
      confirmed({
        status: SettlementStatus.SUBMITTED,
        confirmedBlockHash: null,
      }),
      100, // 1 conf → CONFIRMED
    );

    expect(state.transition).toHaveBeenCalledWith(
      's1',
      SettlementStatus.CONFIRMED,
      expect.objectContaining({
        confirmedBlockHash: '0xAAA',
        confirmedBlockNumber: 100,
      }),
    );
  });
});
