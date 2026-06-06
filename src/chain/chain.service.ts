import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Contract,
  JsonRpcProvider,
  WebSocketProvider,
  Wallet,
  formatUnits,
  parseUnits,
} from 'ethers';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { ERC20_ABI } from './erc20.abi';

type ResubscribeHandler = () => void | Promise<void>;

/**
 * Owns every connection to the chain: HTTP provider (queries, receipts), WSS
 * provider (event subscriptions, recreated on disconnect), the operator Wallet,
 * and a typed USDC contract. Everything else depends on this — no other module
 * constructs an ethers provider.
 */
@Injectable()
export class ChainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChainService.name);

  private httpProvider!: JsonRpcProvider;
  private wssProvider!: WebSocketProvider;
  private wallet!: Wallet;
  /** Wallet-connected contract — used for state-changing transfer() calls. */
  private usdcWrite!: Contract;
  /** WSS-provider-connected contract — used for Transfer event subscriptions. */
  private usdcEvents!: Contract;

  private decimals = 6; // refreshed from chain at boot
  private shuttingDown = false;
  private reconnectAttempts = 0;
  private readonly resubscribeHandlers: ResubscribeHandler[] = [];

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    // staticNetwork avoids a chainId round-trip on every call.
    this.httpProvider = new JsonRpcProvider(this.config.rpcHttpUrl);
    this.wallet = new Wallet(this.config.operatorPrivateKey, this.httpProvider);
    this.usdcWrite = new Contract(
      this.config.usdcContractAddress,
      ERC20_ABI,
      this.wallet,
    );

    try {
      this.decimals = Number(await this.usdcWrite.decimals());
    } catch (err) {
      this.logger.warn(
        `Could not read USDC decimals at boot, defaulting to ${this.decimals}: ${(err as Error).message}`,
      );
    }

    this.connectWss();
    this.logger.log(
      `Chain ready — operator=${this.getOperatorAddress()} usdc=${this.config.usdcContractAddress} decimals=${this.decimals}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.closeWss();
  }

  // ---- WSS lifecycle: auto-reconnect + resubscribe ------------------------

  private connectWss(): void {
    this.wssProvider = new WebSocketProvider(this.config.rpcWssUrl);
    this.usdcEvents = new Contract(
      this.config.usdcContractAddress,
      ERC20_ABI,
      this.wssProvider,
    );

    // ethers v6 exposes the underlying socket as a WebSocketLike with on* hooks.
    const socket = this.wssProvider.websocket as {
      onclose?: (e: unknown) => void;
      onerror?: (e: unknown) => void;
      onopen?: (e: unknown) => void;
    };

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.logger.log('WSS connected');
    };
    socket.onerror = (e) => {
      this.logger.warn(`WSS error: ${describe(e)}`);
    };
    socket.onclose = () => {
      if (this.shuttingDown) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    // Capped exponential backoff: 1s, 2s, 4s … max 30s.
    const delayMs = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 30_000);
    this.logger.warn(
      `WSS closed — reconnect attempt ${this.reconnectAttempts} in ${delayMs}ms`,
    );

    setTimeout(() => {
      if (this.shuttingDown) return;
      void (async () => {
        try {
          await this.closeWss();
        } catch {
          // best-effort teardown of the dead socket
        }
        this.connectWss();
        await this.runResubscribeHandlers();
      })();
    }, delayMs).unref?.();
  }

  private async runResubscribeHandlers(): Promise<void> {
    for (const handler of this.resubscribeHandlers) {
      try {
        await handler();
      } catch (err) {
        this.logger.error(
          `Resubscribe handler failed: ${(err as Error).message}`,
        );
      }
    }
  }

  private async closeWss(): Promise<void> {
    try {
      void this.usdcEvents?.removeAllListeners();
    } catch {
      /* ignore */
    }
    try {
      await this.wssProvider?.destroy();
    } catch {
      /* ignore */
    }
  }

  /**
   * Register a callback fired after every successful WSS reconnect so listeners
   * can re-attach subscriptions AND back-fill anything missed while offline.
   */
  onWssReconnect(handler: ResubscribeHandler): void {
    this.resubscribeHandlers.push(handler);
  }

  // ---- Accessors ----------------------------------------------------------

  getProvider(): JsonRpcProvider {
    return this.httpProvider;
  }

  getWallet(): Wallet {
    return this.wallet;
  }

  /** Wallet-connected contract for transfer(); pass nonce/gas as overrides. */
  getUsdcWriteContract(): Contract {
    return this.usdcWrite;
  }

  /** WSS-connected contract for event subscriptions (current generation). */
  getUsdcEventsContract(): Contract {
    return this.usdcEvents;
  }

  getOperatorAddress(): string {
    return this.wallet.address;
  }

  getDecimals(): number {
    return this.decimals;
  }

  async getCurrentBlock(): Promise<number> {
    return this.httpProvider.getBlockNumber();
  }

  /** Operator's on-chain USDC balance, normalised to a 6-dp Decimal. */
  async getChainBalance(): Promise<Prisma.Decimal> {
    const raw = (await this.usdcWrite.balanceOf(
      this.getOperatorAddress(),
    )) as bigint;
    return new Prisma.Decimal(formatUnits(raw, this.decimals));
  }

  // ---- Amount conversion (decimal <-> base units, never float) ------------

  toBaseUnits(amount: Prisma.Decimal | string): bigint {
    return parseUnits(amount.toString(), this.decimals);
  }

  fromBaseUnits(units: bigint): Prisma.Decimal {
    return new Prisma.Decimal(formatUnits(units, this.decimals));
  }
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String(e.message);
  }
  return String(e);
}
