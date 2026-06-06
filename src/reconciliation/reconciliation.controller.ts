import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationRunDto } from './dto/reconciliation-run.dto';

@ApiTags('Reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'Run reconciliation on demand (ledger vs chain)' })
  @ApiOkResponse({ type: ReconciliationRunDto })
  run() {
    return this.reconciliation.run();
  }
}
