import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiCreatedResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { SettlementsService } from './settlements.service';
import { SettlementPresenter } from './settlement.presenter';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SettlementResponseDto } from './dto/settlement-response.dto';
import { StatusTransitionDto } from './dto/status-transition.dto';

@ApiTags('Settlements')
@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly presenter: SettlementPresenter,
  ) {}

  /**
   * Idempotent create. Returns 200 when the instructionId already existed
   * (echoing the stored record), 201 when a new settlement was accepted.
   */
  @Post()
  @UseGuards(ThrottlerGuard) // rate-limited; GET endpoints stay unthrottled
  @ApiOperation({
    summary: 'Submit a settlement instruction (idempotent on instructionId)',
  })
  @ApiCreatedResponse({
    description: 'New settlement accepted.',
    type: SettlementResponseDto,
  })
  @ApiOkResponse({
    description: 'instructionId already existed — existing record returned.',
    type: SettlementResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failure.' })
  @ApiUnprocessableEntityResponse({
    description: 'Amount exceeds available balance.',
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded.' })
  async create(
    @Body() dto: CreateSettlementDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { settlement, created } = await this.settlements.create(dto);
    res.status(created ? 201 : 200);
    return this.presenter.present(settlement);
  }

  @Get()
  @ApiOperation({ summary: 'List all settlements, newest first' })
  @ApiOkResponse({ type: SettlementResponseDto, isArray: true })
  async list() {
    const settlements = await this.settlements.list();
    return this.presenter.presentMany(settlements);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single settlement by id' })
  @ApiOkResponse({ type: SettlementResponseDto })
  async getOne(@Param('id') id: string) {
    const settlement = await this.settlements.getById(id);
    return this.presenter.present(settlement);
  }

  @Get(':id/transitions')
  @ApiOperation({
    summary: 'Status-transition history for a settlement (audit trail)',
  })
  @ApiOkResponse({ type: StatusTransitionDto, isArray: true })
  getTransitions(@Param('id') id: string) {
    return this.settlements.getTransitions(id);
  }
}
