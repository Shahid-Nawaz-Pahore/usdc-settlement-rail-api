/** Minimal ABI for the DvPEscrow contract used by the rail (settler side). */
export const DVP_ESCROW_ABI = [
  'function fund(bytes32 dealId, address beneficiary, uint256 amount, uint64 deadline)',
  'function release(bytes32 dealId)',
  'function refund(bytes32 dealId)',
  'function cancel(bytes32 dealId)',
  'function getDeal(bytes32 dealId) view returns (tuple(address depositor, address beneficiary, uint256 amount, uint64 deadline, uint8 state))',
  'event Funded(bytes32 indexed dealId, address indexed depositor, address indexed beneficiary, uint256 amount, uint64 deadline)',
  'event Released(bytes32 indexed dealId, address indexed beneficiary, uint256 amount)',
  'event Refunded(bytes32 indexed dealId, address indexed depositor, uint256 amount)',
] as const;

/** ERC-20 surface needed to approve the escrow to pull USDC. */
export const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;

export const DVP_STATE = ['None', 'Funded', 'Released', 'Refunded'] as const;
