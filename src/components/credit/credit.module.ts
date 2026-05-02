import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';
import { CreditScoringEngine } from './credit-scoring.engine';
import { OraclePublisherService } from '../blockchain/oracle-publisher.service';
import { CreditScore, CreditScoreSchema } from '@database/schemas/credit-score.model';
import { Loan, LoanSchema } from '@database/schemas/loan.model';
import { OpenBankingModule } from '../openbanking/openbanking.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: CreditScore.name, schema: CreditScoreSchema },
            { name: Loan.name, schema: LoanSchema },
        ]),
        OpenBankingModule, // Import để sử dụng OpenBankingService + FinancialAnalyzerService
    ],
    controllers: [CreditController],
    providers: [CreditService, CreditScoringEngine, OraclePublisherService],
    exports: [CreditService, CreditScoringEngine, OraclePublisherService],
})
export class CreditModule { }