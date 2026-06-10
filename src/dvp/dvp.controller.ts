import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DvpService } from './dvp.service';
import { CreateDvpDto } from './dto/create-dvp.dto';

@ApiTags('DvP (Delivery-vs-Payment)')
@Controller('settlements/dvp')
export class DvpController {
  constructor(private readonly dvp: DvpService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Fund a DvP deal — locks USDC in escrow' })
  fund(@Body() dto: CreateDvpDto) {
    return this.dvp.fund(dto);
  }

  @Post(':instructionId/release')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Settler releases escrow to the beneficiary (condition met)',
  })
  release(@Param('instructionId') instructionId: string) {
    return this.dvp.release(instructionId);
  }

  @Get(':instructionId')
  @ApiOperation({ summary: 'Read the on-chain deal state from the escrow' })
  getDeal(@Param('instructionId') instructionId: string) {
    return this.dvp.getDeal(instructionId);
  }
}
