import { ApiProperty } from '@nestjs/swagger';
import { ReconciliationStatus } from '@prisma/client';

/** Documentation schema for a reconciliation run. */
export class ReconciliationRunDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: '20',
    description: 'Operator balance from the ledger.',
  })
  ledgerBalance!: string;

  @ApiProperty({
    example: '19.5',
    description: 'Operator USDC balance on-chain.',
  })
  chainBalance!: string;

  @ApiProperty({
    example: '0.5',
    description:
      'In-flight settlements already mined on-chain but not yet FINAL.',
  })
  pendingAmount!: string;

  @ApiProperty({
    example: '0',
    description: 'ledgerBalance − pendingAmount − chainBalance.',
  })
  diff!: string;

  @ApiProperty({
    enum: ReconciliationStatus,
    example: ReconciliationStatus.MATCHED,
  })
  status!: ReconciliationStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
