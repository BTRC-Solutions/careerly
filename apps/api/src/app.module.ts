import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProfileModule } from './modules/profile/index.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { APP_CONFIG, type AppConfig } from './platform/config/app-config.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { HealthController } from './platform/health/health.controller.js';
import { ApiExceptionFilter } from './platform/http/api-exception.filter.js';
import type { AiKeyStore } from './platform/secrets/ai-key-store.js';
import { SecretsModule } from './platform/secrets/secrets.module.js';

/** Makes the validated configuration injectable everywhere. */
@Global()
@Module({})
class ConfigModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

@Module({})
export class AppModule {
  static register(config: AppConfig, aiKeyStore: AiKeyStore): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        SecretsModule.register(aiKeyStore),
        DatabaseModule,
        SettingsModule,
        ProfileModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    };
  }
}
