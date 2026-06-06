import { Module } from '@nestjs/common';
import { RelayerService } from './relayer.service';
import { StuckTxWatcher } from './stuck-tx.watcher';
import { SettlementStateModule } from '../settlement-state/settlement-state.module';

@Module({
  imports: [SettlementStateModule],
  providers: [RelayerService, StuckTxWatcher],
  exports: [RelayerService],
})
export class RelayerModule {}
