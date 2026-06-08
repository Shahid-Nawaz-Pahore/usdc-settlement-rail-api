import { ApiProperty } from '@nestjs/swagger';
import { SettlementStatus } from '@prisma/client';

/** One row of a settlement's append-only status-transition audit trail. */
export class StatusTransitionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  settlementId!: string;

  @ApiProperty({ enum: SettlementStatus })
  fromStatus!: SettlementStatus;

  @ApiProperty({ enum: SettlementStatus })
  toStatus!: SettlementStatus;

  @ApiProperty({ nullable: true, example: '0xabc…' })
  txHash!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
