import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { ObservabilityModule } from './observability/observability.module';
import { SignerModule } from './signer/signer.module';
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
import { OutboxModule } from './outbox/outbox.module';
import { DvpModule } from './dvp/dvp.module';

@Module({
  imports: [
    AppConfigModule, // global: validated env + typed config
    // Structured JSON logging (pino). pino-pretty only in non-production so
    // serverless/prod emit raw JSON to stdout. Redacts secret-shaped fields.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'OPERATOR_PRIVATE_KEY',
            '*.OPERATOR_PRIVATE_KEY',
          ],
          remove: true,
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    ObservabilityModule, // global: Prometheus metrics + /metrics
    SignerModule, // global: ISigner (env key today; KMS/MPC pluggable)
    PrismaModule, // global: db
    ChainModule, // global: providers, signer, USDC contract
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
    OutboxModule,
    DvpModule,
  ],
})
export class AppModule {}
