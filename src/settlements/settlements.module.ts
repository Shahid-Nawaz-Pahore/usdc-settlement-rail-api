import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { LedgerController } from './ledger.controller';
import { SettlementsService } from './settlements.service';
import { SettlementPresenter } from './settlement.presenter';
import { LedgerModule } from '../ledger/ledger.module';
import { RelayerModule } from '../relayer/relayer.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { SettlementStateModule } from '../settlement-state/settlement-state.module';

@Module({
  imports: [
    LedgerModule,
    RelayerModule,
    ComplianceModule,
    SettlementStateModule,
  ],
  controllers: [SettlementsController, LedgerController],
  providers: [SettlementsService, SettlementPresenter],
})
export class SettlementsModule {}
