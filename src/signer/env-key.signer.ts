import { Signer, Wallet } from 'ethers';
import { ISigner } from './signer.interface';

/**
 * Default signer: an in-process key from the environment. The ONLY place the
 * operator private key is read. Swap this binding for a KMS/HSM/MPC signer in
 * SignerModule and nothing else in the app changes.
 */
export class EnvKeySigner implements ISigner {
  private readonly wallet: Wallet;

  constructor(privateKey: string) {
    this.wallet = new Wallet(privateKey);
  }

  getAddress(): Promise<string> {
    return Promise.resolve(this.wallet.address);
  }

  getEthersSigner(): Signer {
    return this.wallet;
  }
}
