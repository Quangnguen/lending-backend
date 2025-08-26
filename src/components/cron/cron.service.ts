import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor() {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async initCronJob() {
    this.logger.log(`INIT CRON JOB - Time: ${new Date()}`);
  }
}
