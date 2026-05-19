import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { LocalKycService } from './local-kyc.service';
import { KycRecord, KycRecordSchema } from '@database/schemas/kyc-record.model';
import { User, UserSchema } from '@database/schemas/user.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KycRecord.name, schema: KycRecordSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [KycController],
  providers: [KycService, LocalKycService],
  exports: [KycService, LocalKycService],
})
export class KycModule {}
