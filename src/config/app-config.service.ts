import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed, centralised accessor over ConfigService so the rest of the app never
 * touches raw process.env and never has to remember which keys are numbers.
 * The private key getter is intentionally the only place it is read.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  private req<T>(key: string): T {
    const value = this.config.get<T>(key);
    if (value === undefined || value === null) {
      // Should be unreachable thanks to Joi validation at boot.
      throw new Error(`Missing required config: ${key}`);
    }
    return value;
  }

  /** Never log the return value of this getter. */
  get operatorPrivateKey(): string {
    return this.req<string>('OPERATOR_PRIVATE_KEY');
  }

  get rpcHttpUrl(): string {
    return this.req<string>('RPC_HTTP_URL');
  }

  get rpcWssUrl(): string {
    return this.req<string>('RPC_WSS_URL');
  }

  get usdcContractAddress(): string {
    return this.req<string>('USDC_CONTRACT_ADDRESS');
  }

  get databaseUrl(): string {
    return this.req<string>('DATABASE_URL');
  }

  get confirmationsConfirmed(): number {
    return Number(this.req<number>('CONFIRMATIONS_CONFIRMED'));
  }

  get confirmationsFinal(): number {
    return Number(this.req<number>('CONFIRMATIONS_FINAL'));
  }

  get stuckTxSeconds(): number {
    return Number(this.req<number>('STUCK_TX_SECONDS'));
  }

  get maxRetries(): number {
    return Number(this.req<number>('MAX_RETRIES'));
  }

  get reconCron(): string {
    return this.req<string>('RECON_CRON');
  }

  /** Comma-separated CORS allowlist, parsed into trimmed origins. */
  get allowedOrigins(): string[] {
    return this.req<string>('ALLOWED_ORIGIN')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }

  get throttleTtlSeconds(): number {
    return Number(this.req<number>('THROTTLE_TTL_SECONDS'));
  }

  get throttleLimit(): number {
    return Number(this.req<number>('THROTTLE_LIMIT'));
  }

  get port(): number {
    return Number(this.req<number>('PORT'));
  }
}
