import { ApiProperty } from '@nestjs/swagger';

/** Documentation schema for GET /ledger/balance. */
export class BalanceViewDto {
  @ApiProperty({
    example: '20',
    description: 'Operator balance derived from the ledger.',
  })
  operatorBalance!: string;

  @ApiProperty({
    example: '0.5',
    description: 'Sum of settlements not yet finalized.',
  })
  inFlightAmount!: string;

  @ApiProperty({
    example: '19.5',
    description:
      'operatorBalance − inFlightAmount; what a new settlement can draw.',
  })
  availableBalance!: string;
}
