/**
 * Provides deterministic dummy env for tests that boot the Nest container
 * (e.g. the DI wiring test). Runs before any module is imported, so
 * ConfigModule's Joi validation sees valid values regardless of the local .env.
 * Unit tests that mock their dependencies are unaffected.
 */
process.env.OPERATOR_PRIVATE_KEY =
  process.env.OPERATOR_PRIVATE_KEY ?? '0x' + '1'.repeat(64);
process.env.RPC_HTTP_URL = process.env.RPC_HTTP_URL ?? 'https://rpc.example';
process.env.RPC_WSS_URL = process.env.RPC_WSS_URL ?? 'wss://rpc.example';
process.env.USDC_CONTRACT_ADDRESS =
  process.env.USDC_CONTRACT_ADDRESS ??
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/settlement_rail';
