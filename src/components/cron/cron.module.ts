import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CronService } from './cron.service';
import { CronController } from './cron.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { LoanModule } from '../loan/loan.module';

@Module({
  imports: [ScheduleModule.forRoot(), BlockchainModule, LoanModule],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
