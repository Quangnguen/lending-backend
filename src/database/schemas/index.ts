import { File, FileSchema } from './file.model';
import { User, UserSchema } from './user.model';
import { Contact, ContactSchema } from './contact.model';
import { UserSession, UserSessionSchema } from './user-session.model';
import {
  UserNotification,
  UserNotificationSchema,
} from './user-notification.model';
import { BankAccount, BankAccountSchema } from './bank-account.model';
import {
  BankTransaction,
  BankTransactionSchema,
} from './bank-transaction.model';
import { LoanRequest, LoanRequestSchema } from './bank-request.model'; // Sửa từ loan-request thành bank-request
import { Loan, LoanSchema } from './loan.model';
import { LoanRepayment, LoanRepaymentSchema } from './loan-repayment.model';
import { LoanOffer, LoanOfferSchema } from './loan-offer.model';
import { Collateral, CollateralSchema } from './collateral.model';
import {
  WalletTransaction,
  WalletTransactionSchema,
} from './wallet-transaction.model';
import { AdminAction, AdminActionSchema } from './admin-action.model';
import { SystemConfig, SystemConfigSchema } from './system-config.model';
import { PlatformFee, PlatformFeeSchema } from './platform-fee.model';
import { LoanReport, LoanReportSchema } from './loan-report.model';
import { AuditLog, AuditLogSchema } from './audit-log.model';

export const schemas = [
  { name: User.name, schema: UserSchema },
  { name: File.name, schema: FileSchema },
  { name: Contact.name, schema: ContactSchema },
  { name: UserSession.name, schema: UserSessionSchema },
  { name: UserNotification.name, schema: UserNotificationSchema },
  { name: BankAccount.name, schema: BankAccountSchema },
  { name: BankTransaction.name, schema: BankTransactionSchema },
  { name: LoanRequest.name, schema: LoanRequestSchema },
  { name: Loan.name, schema: LoanSchema },
  { name: LoanRepayment.name, schema: LoanRepaymentSchema },
  { name: LoanOffer.name, schema: LoanOfferSchema },
  { name: Collateral.name, schema: CollateralSchema },
  { name: WalletTransaction.name, schema: WalletTransactionSchema },
  { name: AdminAction.name, schema: AdminActionSchema },
  { name: SystemConfig.name, schema: SystemConfigSchema },
  { name: PlatformFee.name, schema: PlatformFeeSchema },
  { name: LoanReport.name, schema: LoanReportSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
];

// Export all models and schemas
export * from './user.model';
export * from './file.model';
export * from './contact.model';
export * from './user-session.model';
export * from './user-notification.model';
export * from './bank-account.model';
export * from './bank-transaction.model';
export * from './bank-request.model'; // Sửa từ loan-request thành bank-request
export * from './loan.model';
export * from './loan-repayment.model';
export * from './loan-offer.model';
export * from './collateral.model';
export * from './wallet-transaction.model';
export * from './admin-action.model';
export * from './system-config.model';
export * from './platform-fee.model';
export * from './loan-report.model';
export * from './audit-log.model';
