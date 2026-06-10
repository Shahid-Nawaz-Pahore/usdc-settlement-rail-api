import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
  ) {}

  /** Readiness: returns 503 if the DB or RPC is unreachable. */
  @Get()
  @ApiOperation({ summary: 'Readiness probe — checks DB and RPC reachability' })
  @ApiOkResponse({ description: 'DB and RPC reachable.' })
  @ApiServiceUnavailableResponse({
    description: 'A dependency is unreachable.',
  })
  async ready(@Res({ passthrough: true }) res: Response) {
    const [db, rpc] = await Promise.all([this.checkDb(), this.checkRpc()]);
    const ok = db && rpc;
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', checks: { db, rpc } };
  }

  /** Liveness: process is up; no external dependencies touched. */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 4000);
      return true;
    } catch {
      return false;
    }
  }

  private async checkRpc(): Promise<boolean> {
    try {
      await withTimeout(this.chain.getProvider().getBlockNumber(), 4000);
      return true;
    } catch {
      return false;
    }
  }
}
