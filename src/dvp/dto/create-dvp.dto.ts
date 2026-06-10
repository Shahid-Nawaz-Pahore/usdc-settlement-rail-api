import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { IsChecksummedAddress } from '../../settlements/validators/is-checksummed-address.validator';
import { IsPositiveDecimal } from '../../settlements/validators/is-positive-decimal.validator';

export class CreateDvpDto {
  @ApiProperty({
    description: 'Idempotency key → deterministic dealId.',
    maxLength: 64,
    example: 'dvp-001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  instructionId!: string;

  @ApiProperty({
    description: 'Checksummed beneficiary address.',
    example: '0x645242d9B255A9855aA6196e94bd4d02772747C8',
  })
  @IsChecksummedAddress()
  beneficiary!: string;

  @ApiProperty({
    description: 'USDC amount, max 6 decimals, as a string.',
    example: '0.5',
  })
  @IsPositiveDecimal(6)
  amount!: string;

  @ApiProperty({
    description: 'Seconds until refund-on-timeout is allowed.',
    required: false,
    example: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  deadlineSeconds?: number;
}
