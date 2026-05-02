import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BlockchainService } from "./blockchain.service";
import { Loan, LoanSchema } from "@database/schemas/loan.model";
import { LoanRequest, LoanRequestSchema } from "@database/schemas/bank-request.model";

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Loan.name, schema: LoanSchema },
            { name: LoanRequest.name, schema: LoanRequestSchema },
        ]),
    ],
    providers: [BlockchainService],
    exports: [BlockchainService],
})
export class BlockchainModule { }
