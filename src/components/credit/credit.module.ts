import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';
import { CreditScore, CreditScoreSchema } from '@database/schemas/credit-score.model';
import { OpenBankingModule } from '../openbanking/openbanking.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: CreditScore.name, schema: CreditScoreSchema }
        ]),
        OpenBankingModule, // Import để sử dụng OpenBankingService
    ],
    controllers: [CreditController],
    providers: [CreditService],
    exports: [CreditService], // Export để các module khác có thể dùng
})
export class CreditModule { }