import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CronService } from './cron.service';
import { CronController } from './cron.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BlockchainModule,
  ],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
