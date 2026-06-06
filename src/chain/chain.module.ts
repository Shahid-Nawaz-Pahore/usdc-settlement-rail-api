import { Global, Module } from '@nestjs/common';
import { ChainService } from './chain.service';

// Global: the relayer, listener, ledger and reconciliation modules all need it,
// and there is exactly one operator connection in the process.
@Global()
@Module({
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
