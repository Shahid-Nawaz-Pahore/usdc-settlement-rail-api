import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { ChainModule } from './chain/chain.module';
import { LedgerModule } from './ledger/ledger.module';
import { ComplianceModule } from './compliance/compliance.module';
import { SettlementStateModule } from './settlement-state/settlement-state.module';
import { RelayerModule } from './relayer/relayer.module';
import { ChainListenerModule } from './chain-listener/chain-listener.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AppConfigModule, // global: validated env + typed config
    PrismaModule, // global: db
    ChainModule, // global: providers, wallet, USDC contract
    ScheduleModule.forRoot(), // enables @Interval and dynamic cron
    // Rate limiter (config-driven). Applied selectively to POST /settlements
    // via @UseGuards in the controller, so GET polling stays unthrottled.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        throttlers: [
          {
            ttl: cfg.throttleTtlSeconds * 1000,
            limit: cfg.throttleLimit,
          },
        ],
      }),
    }),
    LedgerModule,
    ComplianceModule,
    SettlementStateModule,
    RelayerModule,
    ChainListenerModule,
    SettlementsModule,
    ReconciliationModule,
    HealthModule,
  ],
})
export class AppModule {}
