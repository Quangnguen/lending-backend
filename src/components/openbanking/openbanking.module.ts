import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

import { OpenBankingService } from './openbanking.service';
import { OpenBankingController } from './openbanking.controller';
import { VietQRService } from './vietqr.service';
import { FinancialAnalyzerService } from './financial-analyzer.service';
import {
  BankConnection,
  BankConnectionSchema,
} from './schemas/bank-connection.schema';

// Mock controllers/services cho demo
import { MockOpenBankingController } from './mock/mock-openbanking.controller';
import { MockOpenBankingService } from './mock/mock-openbanking.service';

// Open Banking Provider (Strategy Pattern)
import { MockOpenBankingProvider } from './providers/mock-openbanking.provider';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BankConnection.name, schema: BankConnectionSchema },
    ]),
    HttpModule.register({
      timeout: 10000, // 10s timeout for VietQR API calls
      maxRedirects: 3,
    }),
  ],
  controllers: [OpenBankingController, MockOpenBankingController],
  providers: [
    OpenBankingService,
    VietQRService,
    MockOpenBankingService,
    MockOpenBankingProvider,
    FinancialAnalyzerService,
  ],
  exports: [
    OpenBankingService,
    VietQRService,
    MockOpenBankingService,
    MockOpenBankingProvider,
    FinancialAnalyzerService,
  ],
})
export class OpenBankingModule {}
