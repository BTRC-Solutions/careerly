import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { LocalDataService } from './local-data.service.js';

@Global()
@Module({
  providers: [DatabaseService, LocalDataService],
  exports: [DatabaseService, LocalDataService],
})
export class DatabaseModule {}
