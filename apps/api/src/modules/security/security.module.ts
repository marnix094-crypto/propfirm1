import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { FIELD_CRYPTO, FieldCrypto } from './field-crypto.js';

@Global()
@Module({
  providers: [
    {
      provide: FIELD_CRYPTO,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new FieldCrypto(c.fieldEncryptionKey),
    },
  ],
  exports: [FIELD_CRYPTO],
})
export class SecurityModule {}
