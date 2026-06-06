import { Module } from '@nestjs/common';
import { SettlementStateService } from './settlement-state.service';

@Module({
  providers: [SettlementStateService],
  exports: [SettlementStateService],
})
export class SettlementStateModule {}
