import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { LocalKycService } from './local-kyc.service';
import { KycCloudinaryService } from './kyc-cloudinary.service';
import { KycRecord, KycRecordSchema } from '@database/schemas/kyc-record.model';
import { User, UserSchema } from '@database/schemas/user.model';
import { AdminAction, AdminActionSchema } from '@database/schemas/admin-action.model';
import { FileProvider } from '@components/file/file.provider';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KycRecord.name, schema: KycRecordSchema },
      { name: User.name, schema: UserSchema },
      { name: AdminAction.name, schema: AdminActionSchema },
    ]),
    NotificationModule,
  ],
  controllers: [KycController],
  providers: [
    FileProvider,           // Khởi tạo Cloudinary v2 config
    KycService,
    LocalKycService,
    KycCloudinaryService,  // Service upload ảnh KYC lên Cloudinary
  ],
  exports: [KycService, LocalKycService, KycCloudinaryService],
})
export class KycModule {}
