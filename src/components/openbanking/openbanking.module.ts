import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OpenBankingService } from './openbanking.service';
import { OpenBankingController } from './openbanking.controller';
import {
  BankConnection,
  BankConnectionSchema,
} from './schemas/bank-connection.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BankConnection.name, schema: BankConnectionSchema },
    ]),
  ],
  controllers: [OpenBankingController],
  providers: [OpenBankingService],
  exports: [OpenBankingService],
})
export class OpenBankingModule {}
