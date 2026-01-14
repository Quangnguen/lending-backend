// ==================== USER ENUMS ====================
export enum KYC_STATUS_ENUM {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum USER_STATUS_ENUM {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export enum GENDER_ENUM {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum ROLE_ENUM {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

// ==================== DEVICE ENUMS ====================
export enum DEVICE_TYPE_ENUM {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

// ==================== NOTIFICATION ENUMS ====================
export enum NOTIFICATION_TYPE_ENUM {
  LOAN = 'loan',
  PAYMENT = 'payment',
  KYC = 'kyc',
  SYSTEM = 'system',
  PROMOTION = 'promotion',
}

// ==================== BANK ENUMS ====================
export enum BANK_ACCOUNT_STATUS_ENUM {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}

export enum BANK_TRANSACTION_TYPE_ENUM {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
}

export enum TRANSACTION_STATUS_ENUM {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ==================== LOAN ENUMS ====================
export enum LOAN_PURPOSE_ENUM {
  PERSONAL = 'personal',
  BUSINESS = 'business',
  EDUCATION = 'education',
  MEDICAL = 'medical',
  OTHER = 'other',
}

export enum COLLATERAL_TYPE_ENUM {
  NONE = 'none',
  CRYPTO = 'crypto',
  PROPERTY = 'property',
  VEHICLE = 'vehicle',
  NFT = 'nft',
  OTHER = 'other',
}

export enum LOAN_REQUEST_STATUS_ENUM {
  PENDING = 'pending',
  APPROVED = 'approved',
  FUNDED = 'funded',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum LOAN_STATUS_ENUM {
  ACTIVE = 'active',
  REPAID = 'repaid',
  OVERDUE = 'overdue',
  DEFAULTED = 'defaulted',
  LIQUIDATED = 'liquidated',
}

export enum LOAN_OFFER_STATUS_ENUM {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

export enum REPAYMENT_STATUS_ENUM {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum PAYMENT_METHOD_ENUM {
  WALLET = 'wallet',
  BANK_TRANSFER = 'bank_transfer',
  CRYPTO = 'crypto',
}

// ==================== COLLATERAL ENUMS ====================
export enum COLLATERAL_STATUS_ENUM {
  LOCKED = 'locked',
  RELEASED = 'released',
  LIQUIDATED = 'liquidated',
}

// ==================== WALLET ENUMS ====================
export enum WALLET_TRANSACTION_TYPE_ENUM {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  LOAN_FUND = 'loan_fund',
  LOAN_REPAY = 'loan_repay',
  FEE = 'fee',
  BONUS = 'bonus',
}

export enum TRANSACTION_DIRECTION_ENUM {
  IN = 'in',
  OUT = 'out',
}

export enum REFERENCE_TYPE_ENUM {
  LOAN = 'loan',
  BANK = 'bank',
  COLLATERAL = 'collateral',
  ADMIN = 'admin',
}

// ==================== ADMIN ENUMS ====================
export enum ADMIN_TARGET_TYPE_ENUM {
  USER = 'user',
  LOAN = 'loan',
  KYC = 'kyc',
  SYSTEM = 'system',
}

export enum CONFIG_VALUE_TYPE_ENUM {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}

export enum FEE_TYPE_ENUM {
  LOAN_ORIGINATION = 'loan_origination',
  LATE_PAYMENT = 'late_payment',
  WITHDRAWAL = 'withdrawal',
  CONVERSION = 'conversion',
}

// ==================== REPORT ENUMS ====================
export enum REPORT_ISSUE_TYPE_ENUM {
  FRAUD = 'fraud',
  NON_PAYMENT = 'non_payment',
  DISPUTE = 'dispute',
  OTHER = 'other',
}

export enum REPORT_STATUS_ENUM {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}
