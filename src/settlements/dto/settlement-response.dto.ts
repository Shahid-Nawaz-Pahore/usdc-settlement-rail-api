import { ApiProperty } from '@nestjs/swagger';
import { SettlementStatus } from '@prisma/client';

/** Documentation schema for a settlement record returned by the API. */
export class SettlementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'inv-001' })
  instructionId!: string;

  @ApiProperty({ example: '0x645242d9B255A9855aA6196e94bd4d02772747C8' })
  toAddress!: string;

  @ApiProperty({ example: '0.5', description: 'USDC, 6 dp, as a string.' })
  amount!: string;

  @ApiProperty({ enum: SettlementStatus, example: SettlementStatus.SUBMITTED })
  status!: SettlementStatus;

  @ApiProperty({
    nullable: true,
    example: '0xabc…',
    description: 'On-chain tx hash once broadcast.',
  })
  txHash!: string | null;

  @ApiProperty({
    nullable: true,
    example: 42,
    description: 'Operator nonce assigned to the tx.',
  })
  nonce!: number | null;

  @ApiProperty({ nullable: true, example: null })
  failureReason!: string | null;

  @ApiProperty({ example: 0 })
  retryCount!: number;

  @ApiProperty({
    nullable: true,
    example: 3,
    description:
      'Block confirmations for in-flight settlements; null otherwise.',
  })
  confirmations!: number | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
