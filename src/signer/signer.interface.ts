import { Signer } from 'ethers';

/**
 * Signing abstraction. The rail never touches a private key directly — it asks
 * the ISigner for an ethers Signer to connect contracts and broadcast, and for
 * the operator address. The env-key implementation holds the key in process;
 * a production binding would be a KMS/HSM or MPC/threshold signer (e.g.
 * Fireblocks) where the key never enters application memory.
 */
export interface ISigner {
  /** Operator address this signer controls. */
  getAddress(): Promise<string>;
  /** An ethers Signer (unconnected); ChainService connects it to the provider. */
  getEthersSigner(): Signer;
}

export const SIGNER = Symbol('SIGNER');
