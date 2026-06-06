import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { BalanceViewDto } from './dto/balance-view.dto';

@ApiTags('Ledger')
@Controller('ledger')
export class LedgerController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Operator, in-flight, and available balances' })
  @ApiOkResponse({ type: BalanceViewDto })
  balance() {
    return this.settlements.balanceView();
  }
}
