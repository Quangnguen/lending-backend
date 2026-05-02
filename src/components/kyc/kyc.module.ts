import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { FptAiService } from './fptai.service';
import { KycRecord, KycRecordSchema } from '@database/schemas/kyc-record.model';
import { User, UserSchema } from '@database/schemas/user.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KycRecord.name, schema: KycRecordSchema },
      { name: User.name, schema: UserSchema },
    ]),
    HttpModule.register({
      timeout: 60000, // FPT.AI có thể mất thời gian xử lý ảnh
      maxRedirects: 3,
    }),
  ],
  controllers: [KycController],
  providers: [KycService, FptAiService],
  exports: [KycService, FptAiService],
})
export class KycModule {}
