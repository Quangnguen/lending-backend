import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OpenBankingService } from './openbanking.service';
import { OpenBankingController } from './openbanking.controller';
import {
  BankConnection,
  BankConnectionSchema,
} from './schemas/bank-connection.schema';

// Import 2 file mới vừa tạo
import { MockOpenBankingController } from './mock/mock-openbanking.controller';
import { MockOpenBankingService } from './mock/mock-openbanking.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BankConnection.name, schema: BankConnectionSchema },
    ]),
  ],
  controllers: [OpenBankingController, MockOpenBankingController],
  providers: [OpenBankingService, MockOpenBankingService],
  exports: [OpenBankingService, MockOpenBankingService],
})
export class OpenBankingModule { }
