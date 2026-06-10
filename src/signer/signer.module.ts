import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SIGNER } from './signer.interface';
import { EnvKeySigner } from './env-key.signer';

/**
 * Binds the SIGNER token. Today: EnvKeySigner (env private key). To go custodial
 * with a KMS/HSM/MPC provider, replace the factory here — ChainService and the
 * relayer are unaffected because they depend only on ISigner.
 */
@Global()
@Module({
  providers: [
    {
      provide: SIGNER,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) =>
        new EnvKeySigner(cfg.operatorPrivateKey),
    },
  ],
  exports: [SIGNER],
})
export class SignerModule {}
