/**
 * Open Banking Provider Interface (Strategy Pattern)
 *
 * Thiết kế theo chuẩn PSD2/Open Banking, áp dụng cho Việt Nam:
 * - Hiện tại: MockProvider (demo/development)
 * - Tương lai: NapasProvider (NAPAS Open API), hoặc tích hợp trực tiếp API NH
 *
 * Tham khảo:
 * - EU PSD2: Account Information Service (AIS), Payment Initiation Service (PIS)
 * - VN: NAPAS Open API (draft), Circular 16/2024/TT-NHNN (Open Banking roadmap)
 */

// ===== Core Interfaces =====

export interface OpenBankingProviderConfig {
  name: string; // Provider identifier (mock, napas, vietqr)
  baseUrl?: string; // API base URL
  clientId?: string; // Client credentials
  clientSecret?: string;
  apiKey?: string;
  environment: 'sandbox' | 'production';
}

/**
 * Account Information - theo chuẩn AIS (Account Information Service)
 */
export interface OBAccountInfo {
  accountId: string; // Unique ID từ provider
  bankCode: string; // Mã NH (VCB, TCB, MB...)
  bankName: string;
  accountNumber: string; // Số TK (sẽ được mask khi trả ra)
  accountName: string; // Tên chủ TK
  accountType: 'CURRENT' | 'SAVINGS' | 'CREDIT' | 'LOAN';
  currency: string; // VND, USD
  balance: number; // Số dư hiện tại
  availableBalance: number; // Số dư khả dụng
  lastSyncedAt: Date;
}

/**
 * Transaction History - theo chuẩn AIS
 */
export interface OBTransaction {
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  type: 'CREDIT' | 'DEBIT'; // CREDIT = tiền vào, DEBIT = tiền ra
  category?: TransactionCategory;
  description: string;
  counterpartyName?: string; // Tên bên kia (người gửi/nhận)
  counterpartyBank?: string;
  referenceNumber?: string;
  bookingDate: Date; // Ngày ghi nhận
  valueDate: Date; // Ngày giá trị
  status: 'BOOKED' | 'PENDING';
}

/**
 * Phân loại giao dịch - quan trọng cho Credit Scoring
 */
export enum TransactionCategory {
  SALARY = 'SALARY', // Lương
  FREELANCE_INCOME = 'FREELANCE', // Thu nhập tự do
  TRANSFER_IN = 'TRANSFER_IN', // Chuyển khoản đến
  TRANSFER_OUT = 'TRANSFER_OUT', // Chuyển khoản đi
  BILL_PAYMENT = 'BILL_PAYMENT', // Thanh toán hóa đơn
  SHOPPING = 'SHOPPING', // Mua sắm
  FOOD = 'FOOD', // Ăn uống
  TRANSPORT = 'TRANSPORT', // Di chuyển
  SAVINGS = 'SAVINGS', // Tiết kiệm
  LOAN_REPAYMENT = 'LOAN_REPAY', // Trả nợ vay
  INVESTMENT = 'INVESTMENT', // Đầu tư
  INSURANCE = 'INSURANCE', // Bảo hiểm
  OTHER = 'OTHER',
}

/**
 * Financial Summary - Tổng hợp tài chính (input chính cho Credit Scoring)
 */
export interface OBFinancialSummary {
  userId: string;
  period: {
    from: Date;
    to: Date;
    months: number;
  };

  // Thu nhập
  income: {
    totalIncome: number; // Tổng thu nhập trong kỳ
    monthlyAvgIncome: number; // Thu nhập TB/tháng
    salaryIncome: number; // Thu nhập từ lương (ổn định)
    otherIncome: number; // Thu nhập khác
    incomeStability: number; // 0-1, mức ổn định thu nhập
    salaryDay?: number; // Ngày nhận lương (1-31)
  };

  // Chi tiêu
  expenses: {
    totalExpenses: number;
    monthlyAvgExpenses: number;
    essentialExpenses: number; // Chi phí thiết yếu (bills, transport)
    discretionaryExpenses: number; // Chi phí tùy ý (shopping, food)
    savingsRate: number; // Tỷ lệ tiết kiệm (income - expenses) / income
  };

  // Số dư & Tài sản
  balance: {
    currentBalance: number; // Số dư hiện tại (tổng các TK)
    avgBalance: number; // Số dư trung bình 3 tháng
    minBalance: number; // Số dư thấp nhất 3 tháng
    totalAccounts: number; // Số TK liên kết
    hasSavingsAccount: boolean; // Có TK tiết kiệm không
  };

  // Hành vi giao dịch
  behavior: {
    totalTransactions: number;
    avgTransactionsPerMonth: number;
    regularPayments: number; // Số thanh toán đều đặn
    overdraftCount: number; // Số lần thấu chi
    bounceCount: number; // Số lần giao dịch bị từ chối
  };

  // Nợ hiện tại (nếu detect được)
  existingDebt: {
    hasLoanRepayments: boolean;
    estimatedMonthlyRepayment: number;
    debtToIncomeRatio: number; // DTI ratio
  };

  // Metadata
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW'; // Chất lượng dữ liệu
  dataSource: 'REAL_API' | 'MOCK' | 'HYBRID';
  analyzedAt: Date;
}

/**
 * Consent - Quản lý đồng ý chia sẻ dữ liệu (theo PSD2)
 */
export interface OBConsent {
  consentId: string;
  userId: string;
  bankCode: string;
  permissions: ConsentPermission[];
  status:
    | 'AWAITING_AUTHORIZATION'
    | 'AUTHORIZED'
    | 'REJECTED'
    | 'REVOKED'
    | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date; // Max 90 ngày theo PSD2
  lastAccessedAt?: Date;
}

export enum ConsentPermission {
  READ_ACCOUNTS = 'ReadAccountsDetail',
  READ_BALANCES = 'ReadBalancesDetail',
  READ_TRANSACTIONS = 'ReadTransactionsDetail',
}

// ===== Provider Interface =====

export interface IOpenBankingProvider {
  readonly providerName: string;

  /**
   * Bước 1: Khởi tạo liên kết - tạo consent & redirect URL
   */
  initiateConsent(
    userId: string,
    bankCode: string,
    permissions: ConsentPermission[],
  ): Promise<{
    consentId: string;
    authorizeUrl?: string;
    otpRequired?: boolean;
  }>;

  /**
   * Bước 2: Xác nhận consent (OTP hoặc redirect callback)
   */
  confirmConsent(
    consentId: string,
    authCode: string, // OTP hoặc authorization code
  ): Promise<OBConsent>;

  /**
   * Lấy danh sách tài khoản đã được consent
   */
  getAccounts(consentId: string): Promise<OBAccountInfo[]>;

  /**
   * Lấy số dư tài khoản
   */
  getBalance(
    consentId: string,
    accountId: string,
  ): Promise<{ balance: number; availableBalance: number; currency: string }>;

  /**
   * Lấy lịch sử giao dịch (với phân trang)
   */
  getTransactions(
    consentId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date,
    page?: number,
    limit?: number,
  ): Promise<{
    transactions: OBTransaction[];
    totalCount: number;
    hasMore: boolean;
  }>;

  /**
   * Thu hồi consent
   */
  revokeConsent(consentId: string): Promise<void>;

  /**
   * Kiểm tra trạng thái provider
   */
  healthCheck(): Promise<{ status: 'UP' | 'DOWN'; latencyMs: number }>;
}
