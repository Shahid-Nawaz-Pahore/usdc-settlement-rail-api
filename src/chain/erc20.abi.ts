/**
 * Minimal ERC-20 surface we touch on the official USDC contract.
 * We never deploy or modify a contract — only call these existing methods/events.
 */
export const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
] as const;
