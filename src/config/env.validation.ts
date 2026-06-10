import * as Joi from 'joi';

/**
 * Boot-time environment schema. Anything missing or malformed aborts startup
 * (fail fast) rather than surfacing as a confusing runtime error mid-settlement.
 */
export const envValidationSchema = Joi.object({
  // ethers accepts a 32-byte hex key with or without the 0x prefix.
  OPERATOR_PRIVATE_KEY: Joi.string()
    .pattern(/^(0x)?[0-9a-fA-F]{64}$/)
    .required(),
  RPC_HTTP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  RPC_WSS_URL: Joi.string()
    .uri({ scheme: ['ws', 'wss'] })
    .required(),
  USDC_CONTRACT_ADDRESS: Joi.string()
    .pattern(/^0x[0-9a-fA-F]{40}$/)
    .required(),
  DATABASE_URL: Joi.string().uri().required(),

  CONFIRMATIONS_CONFIRMED: Joi.number().integer().min(1).default(1),
  CONFIRMATIONS_FINAL: Joi.number().integer().min(1).default(5),
  STUCK_TX_SECONDS: Joi.number().integer().min(1).default(60),
  MAX_RETRIES: Joi.number().integer().min(0).default(3),
  RECON_CRON: Joi.string().default('*/5 * * * *'),

  // CORS: comma-separated allowlist of dashboard origins (never a wildcard).
  ALLOWED_ORIGIN: Joi.string().default('http://localhost:3001'),

  // Rate limiting for POST /settlements.
  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(10),

  // Optional: Redis (Streams) for the event outbox relay. Unset → log-only
  // publisher (events still written to the outbox, just not relayed).
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .optional(),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),
}).custom((value: Record<string, number>, helpers) => {
  if (value.CONFIRMATIONS_FINAL < value.CONFIRMATIONS_CONFIRMED) {
    return helpers.error('any.invalid', {
      message: 'CONFIRMATIONS_FINAL must be >= CONFIRMATIONS_CONFIRMED',
    });
  }
  return value;
});
