import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsChecksummedAddress } from '../validators/is-checksummed-address.validator';
import { IsPositiveDecimal } from '../validators/is-positive-decimal.validator';

export class CreateSettlementDto {
  @ApiProperty({
    description:
      'Idempotency key — resubmitting the same value returns the same record.',
    maxLength: 64,
    example: 'inv-001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  instructionId!: string;

  @ApiProperty({
    description: 'Checksummed (EIP-55) recipient address.',
    example: '0x645242d9B255A9855aA6196e94bd4d02772747C8',
  })
  @IsChecksummedAddress()
  toAddress!: string;

  @ApiProperty({
    description:
      'Positive USDC amount as a string, max 6 decimal places (never a float).',
    example: '0.5',
  })
  @IsPositiveDecimal(6)
  amount!: string;
}
