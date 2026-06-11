import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

import { Notification, NotificationSchema } from './notification.schema';
import { DeviceToken, DeviceTokenSchema } from './schemas/device-token.schema';
import { Loan, LoanSchema } from '@database/schemas/loan.model';
import { User, UserSchema } from '@database/schemas/user.model';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { FirebasePushService } from './firebase-push.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.register({}), // gateway dùng JwtService với secret từ ConfigService
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, FirebasePushService],
  exports: [NotificationService],
})
export class NotificationModule {}
