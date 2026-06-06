/**
 * Classifies a send/broadcast error into a retry policy.
 *
 * - retryable      : transient (network/timeout/server) — back off and retry.
 * - resyncNonce    : our local nonce is wrong (too low / already known / replacement
 *                    underpriced) — refetch the pending nonce before retrying.
 * - permanent      : will never succeed as-is (insufficient funds / revert) — fail.
 */
export interface TxErrorClass {
  retryable: boolean;
  resyncNonce: boolean;
  reason: string;
}

export function classifyTxError(err: unknown): TxErrorClass {
  const code = readCode(err);
  const message = readMessage(err).toLowerCase();

  // Nonce desync — recoverable by refetching the on-chain pending nonce.
  if (
    code === 'NONCE_EXPIRED' ||
    code === 'REPLACEMENT_UNDERPRICED' ||
    message.includes('nonce too low') ||
    message.includes('already known') ||
    message.includes('replacement transaction underpriced')
  ) {
    return {
      retryable: true,
      resyncNonce: true,
      reason: code ?? 'NONCE_DESYNC',
    };
  }

  // Transient infrastructure issues.
  if (
    code === 'NETWORK_ERROR' ||
    code === 'TIMEOUT' ||
    code === 'SERVER_ERROR' ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('rate limit') ||
    message.includes('429')
  ) {
    return { retryable: true, resyncNonce: false, reason: code ?? 'TRANSIENT' };
  }

  // Underpriced (not a replacement) — bump fees and retry.
  if (
    message.includes('underpriced') ||
    message.includes('fee too low') ||
    message.includes('max fee per gas less than block base fee')
  ) {
    return { retryable: true, resyncNonce: false, reason: 'UNDERPRICED' };
  }

  // Permanent failures.
  if (code === 'INSUFFICIENT_FUNDS' || message.includes('insufficient funds')) {
    return {
      retryable: false,
      resyncNonce: false,
      reason: 'INSUFFICIENT_FUNDS',
    };
  }
  if (
    code === 'CALL_EXCEPTION' ||
    message.includes('execution reverted') ||
    message.includes('transfer amount exceeds balance')
  ) {
    return { retryable: false, resyncNonce: false, reason: 'REVERTED' };
  }

  // Unknown — treat conservatively as retryable once, but do not resync nonce.
  return { retryable: true, resyncNonce: false, reason: code ?? 'UNKNOWN' };
}

function readCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = err.code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

function readMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  }
  return String(err);
}
