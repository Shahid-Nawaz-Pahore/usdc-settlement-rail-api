import { Module } from '@nestjs/common';
import { ChainListenerService } from './chain-listener.service';
import { LedgerModule } from '../ledger/ledger.module';
import { SettlementStateModule } from '../settlement-state/settlement-state.module';

@Module({
  imports: [LedgerModule, SettlementStateModule],
  providers: [ChainListenerService],
})
export class ChainListenerModule {}
