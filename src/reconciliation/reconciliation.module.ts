import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { SettlementStateModule } from '../settlement-state/settlement-state.module';

@Module({
  imports: [LedgerModule, SettlementStateModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
