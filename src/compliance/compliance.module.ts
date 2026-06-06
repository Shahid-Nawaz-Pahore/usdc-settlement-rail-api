import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { COMPLIANCE_PROVIDER } from './compliance.interface';

@Module({
  providers: [
    ComplianceService,
    // Bind the interface token to the mock; rebind to a real provider here.
    { provide: COMPLIANCE_PROVIDER, useExisting: ComplianceService },
  ],
  exports: [COMPLIANCE_PROVIDER],
})
export class ComplianceModule {}
