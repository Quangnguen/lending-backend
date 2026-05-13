import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { LenderMarketplaceService } from './lender-marketplace.service';
import { DisbursementService } from './disbursement.service';
import { LiquidationService } from './liquidation.service';
import { Loan, LoanSchema } from '@database/schemas/loan.model';
import { LoanRequest, LoanRequestSchema } from '@database/schemas/bank-request.model';
import { LoanRepayment, LoanRepaymentSchema } from '@database/schemas/loan-repayment.model';
import { LoanOffer, LoanOfferSchema } from '@database/schemas/loan-offer.model';
import { CreditScore, CreditScoreSchema } from '@database/schemas/credit-score.model';
import { User, UserSchema } from '@database/schemas/user.model';
import { CreditModule } from '../credit/credit.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { OpenBankingModule } from '../openbanking/openbanking.module';
import { NotificationModule } from '../notification/notification.module';


@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Loan.name, schema: LoanSchema },
            { name: LoanRequest.name, schema: LoanRequestSchema },
            { name: LoanRepayment.name, schema: LoanRepaymentSchema },
            { name: LoanOffer.name, schema: LoanOfferSchema },
            { name: CreditScore.name, schema: CreditScoreSchema },
            { name: User.name, schema: UserSchema },
        ]),
        CreditModule,
        BlockchainModule,
        OpenBankingModule,
        NotificationModule,
    ],
    controllers: [LoanController],
    providers: [LoanService, LenderMarketplaceService, DisbursementService, LiquidationService],
    exports: [LoanService, LenderMarketplaceService, DisbursementService, LiquidationService],
})
export class LoanModule { }