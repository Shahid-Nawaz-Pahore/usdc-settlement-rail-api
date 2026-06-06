export interface ComplianceResult {
  approved: boolean;
  reason?: string;
}

/**
 * Screening provider abstraction. The mock below is a static blocklist; a real
 * deployment would bind this token to a Chainalysis / TRM Labs adapter that calls
 * their address-screening API. Consumers depend only on this interface.
 */
export interface IComplianceProvider {
  check(toAddress: string): Promise<ComplianceResult>;
}

export const COMPLIANCE_PROVIDER = Symbol('COMPLIANCE_PROVIDER');
