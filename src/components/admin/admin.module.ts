import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

import { AdminAction, AdminActionSchema } from '@database/schemas/admin-action.model';
import { SystemConfig, SystemConfigSchema } from '@database/schemas/system-config.model';
import { User, UserSchema } from '@database/schemas/user.model';
import { LoanRequest, LoanRequestSchema } from '@database/schemas/bank-request.model';
import { Loan, LoanSchema } from '@database/schemas/loan.model';
import { LoanRepayment, LoanRepaymentSchema } from '@database/schemas/loan-repayment.model';
import { Notification, NotificationSchema } from '../notification/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminAction.name, schema: AdminActionSchema },
      { name: SystemConfig.name, schema: SystemConfigSchema },
      { name: User.name, schema: UserSchema },
      { name: LoanRequest.name, schema: LoanRequestSchema },
      { name: Loan.name, schema: LoanSchema },
      { name: LoanRepayment.name, schema: LoanRepaymentSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
