import { type DynamicModule, Global, Module } from '@nestjs/common';
import { AiKeyStore } from './ai-key-store.js';

/** Makes the in-memory secrets injectable everywhere. The instance is owned by the bootstrap code. */
@Global()
@Module({})
export class SecretsModule {
  static register(aiKeyStore: AiKeyStore): DynamicModule {
    return {
      module: SecretsModule,
      providers: [{ provide: AiKeyStore, useValue: aiKeyStore }],
      exports: [AiKeyStore],
    };
  }
}
