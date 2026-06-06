import { Injectable, Logger } from '@nestjs/common';
import { getAddress } from 'ethers';
import { ComplianceResult, IComplianceProvider } from './compliance.interface';

/**
 * Mock compliance provider: a hardcoded blocklist of test addresses.
 *
 * Swap-in point for production: implement IComplianceProvider against
 * Chainalysis / TRM Labs and rebind COMPLIANCE_PROVIDER in the module. The rest
 * of the app is unaffected because it only depends on the interface.
 */
@Injectable()
export class ComplianceService implements IComplianceProvider {
  private readonly logger = new Logger(ComplianceService.name);

  // Two test addresses. Stored lowercase and normalised to checksummed form so
  // lookups are case-insensitive regardless of how the caller cased the input.
  private readonly blocklist = new Set<string>(
    [
      '0x000000000000000000000000000000000000dead',
      '0x0000000000000000000000000000000000000bad',
    ].map((a) => getAddress(a)),
  );

  // Returns a Promise to match IComplianceProvider; a real provider would
  // `await` a screening API here. The mock resolves synchronously.
  check(toAddress: string): Promise<ComplianceResult> {
    let normalized: string;
    try {
      normalized = getAddress(toAddress);
    } catch {
      this.logger.warn(`Compliance check: invalid address ${toAddress}`);
      return Promise.resolve({ approved: false, reason: 'INVALID_ADDRESS' });
    }

    const blocked = this.blocklist.has(normalized);
    this.logger.log(
      `Compliance check address=${normalized} result=${blocked ? 'BLOCKED' : 'APPROVED'}`,
    );

    return Promise.resolve(
      blocked
        ? { approved: false, reason: 'ADDRESS_BLOCKLISTED' }
        : { approved: true },
    );
  }
}
