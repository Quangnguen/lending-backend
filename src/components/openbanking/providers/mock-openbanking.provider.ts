import { Injectable, Logger } from '@nestjs/common';
import {
  IOpenBankingProvider,
  OBAccountInfo,
  OBTransaction,
  OBConsent,
  OBFinancialSummary,
  TransactionCategory,
  ConsentPermission,
} from './openbanking-provider.interface';

/**
 * MockOpenBankingProvider — Triển khai IOpenBankingProvider cho môi trường demo/dev
 *
 * Mô phỏng hoàn chỉnh luồng Open Banking:
 * 1. Consent: OTP-based (không redirect vì không có bank portal)
 * 2. Accounts: 1-3 tài khoản VN với số dư thực tế
 * 3. Transactions: 3-6 tháng lịch sử giao dịch (60-180 giao dịch)
 *    - Lương đều đặn hàng tháng
 *    - Chi tiêu hóa đơn, mua sắm, ăn uống
 *    - Chuyển khoản, tiết kiệm
 * 4. Financial Summary: Phân tích tổng hợp cho Credit Scoring
 */
@Injectable()
export class MockOpenBankingProvider implements IOpenBankingProvider {
  readonly providerName = 'MOCK_VN';
  private readonly logger = new Logger(MockOpenBankingProvider.name);

  // Lưu consent sessions trong RAM
  private consents = new Map<
    string,
    OBConsent & { bankCode: string; otp: string }
  >();

  // ==========================================
  // 1. CONSENT FLOW
  // ==========================================

  async initiateConsent(
    userId: string,
    bankCode: string,
    permissions: ConsentPermission[],
  ) {
    const consentId = `consent_${bankCode}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const otp = '123456'; // Demo OTP

    this.consents.set(consentId, {
      consentId,
      userId,
      bankCode,
      permissions,
      status: 'AWAITING_AUTHORIZATION',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000), // 90 ngày
      otp,
    });

    this.logger.log(
      `[Mock] Consent initiated: ${consentId} for bank ${bankCode}`,
    );

    return {
      consentId,
      otpRequired: true,
      // Trong thực tế với NAPAS/bank redirect: authorizeUrl: 'https://bank.example.com/authorize?...'
    };
  }

  async confirmConsent(
    consentId: string,
    authCode: string,
  ): Promise<OBConsent> {
    const consent = this.consents.get(consentId);
    if (!consent) throw new Error('Consent không tồn tại hoặc đã hết hạn');
    if (consent.status !== 'AWAITING_AUTHORIZATION')
      throw new Error('Consent đã được xử lý');

    // Verify OTP (demo: 123456)
    if (authCode !== consent.otp) throw new Error('Mã OTP không đúng');

    consent.status = 'AUTHORIZED';
    consent.lastAccessedAt = new Date();
    this.consents.set(consentId, consent);

    this.logger.log(`[Mock] Consent authorized: ${consentId}`);
    return consent;
  }

  async revokeConsent(consentId: string): Promise<void> {
    const consent = this.consents.get(consentId);
    if (consent) {
      consent.status = 'REVOKED';
      this.consents.set(consentId, consent);
    }
  }

  async healthCheck() {
    return { status: 'UP' as const, latencyMs: 12 };
  }

  // ==========================================
  // 2. ACCOUNT INFORMATION SERVICE (AIS)
  // ==========================================

  async getAccounts(consentId: string): Promise<OBAccountInfo[]> {
    const consent = this.consents.get(consentId);
    if (!consent || consent.status !== 'AUTHORIZED') {
      throw new Error('Consent không hợp lệ hoặc chưa được xác nhận');
    }

    // Tạo tài khoản mock dựa trên bankCode
    return this.generateMockAccounts(consent.bankCode);
  }

  async getBalance(consentId: string, accountId: string) {
    const accounts = await this.getAccounts(consentId);
    const account = accounts.find((a) => a.accountId === accountId);
    if (!account) throw new Error('Tài khoản không tồn tại');

    return {
      balance: account.balance,
      availableBalance: account.availableBalance,
      currency: account.currency,
    };
  }

  // ==========================================
  // 3. TRANSACTION HISTORY
  // ==========================================

  async getTransactions(
    consentId: string,
    accountId: string,
    fromDate: Date,
    toDate: Date,
    page = 1,
    limit = 50,
  ) {
    const consent = this.consents.get(consentId);
    if (!consent || consent.status !== 'AUTHORIZED') {
      throw new Error('Consent không hợp lệ');
    }

    const allTransactions = this.generateMockTransactions(
      accountId,
      fromDate,
      toDate,
    );
    const start = (page - 1) * limit;
    const paginatedTx = allTransactions.slice(start, start + limit);

    return {
      transactions: paginatedTx,
      totalCount: allTransactions.length,
      hasMore: start + limit < allTransactions.length,
    };
  }

  // ==========================================
  // 4. FINANCIAL SUMMARY (quan trọng cho Credit Scoring)
  // ==========================================

  /**
   * Phân tích tổng hợp tài chính từ dữ liệu Open Banking
   * → Input chính cho CreditService.calculateCreditScore()
   */
  async analyzeFinancials(consentId: string): Promise<OBFinancialSummary> {
    const consent = this.consents.get(consentId);
    if (!consent || consent.status !== 'AUTHORIZED') {
      throw new Error('Consent không hợp lệ');
    }

    const accounts = await this.getAccounts(consentId);
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const now = new Date();

    // Thu thập tất cả giao dịch 3 tháng
    const allTransactions: OBTransaction[] = [];
    for (const acc of accounts) {
      const { transactions } = await this.getTransactions(
        consentId,
        acc.accountId,
        threeMonthsAgo,
        now,
        1,
        500,
      );
      allTransactions.push(...transactions);
    }

    // Phân tích thu nhập
    const credits = allTransactions.filter((tx) => tx.type === 'CREDIT');
    const debits = allTransactions.filter((tx) => tx.type === 'DEBIT');

    const totalIncome = credits.reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpenses = debits.reduce((sum, tx) => sum + tx.amount, 0);

    const salaryTx = credits.filter(
      (tx) => tx.category === TransactionCategory.SALARY,
    );
    const salaryIncome = salaryTx.reduce((sum, tx) => sum + tx.amount, 0);

    // Tính ổn định thu nhập (salary đều đặn = ổn định cao)
    const monthlySalaries = this.groupByMonth(salaryTx);
    const incomeStability = this.calculateStability(monthlySalaries);

    // Detect ngày lương (ngày phổ biến nhất nhận salary)
    const salaryDays = salaryTx.map((tx) => new Date(tx.bookingDate).getDate());
    const salaryDay = this.mostFrequent(salaryDays);

    // Chi phí thiết yếu vs tùy ý
    const essentialCategories = [
      TransactionCategory.BILL_PAYMENT,
      TransactionCategory.TRANSPORT,
      TransactionCategory.INSURANCE,
      TransactionCategory.LOAN_REPAYMENT,
    ];
    const essentialExpenses = debits
      .filter((tx) => essentialCategories.includes(tx.category))
      .reduce((sum, tx) => sum + tx.amount, 0);
    const discretionaryExpenses = totalExpenses - essentialExpenses;

    // Số dư
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    // Detect nợ hiện tại
    const loanRepayments = debits.filter(
      (tx) => tx.category === TransactionCategory.LOAN_REPAYMENT,
    );
    const monthlyRepayment =
      loanRepayments.length > 0
        ? loanRepayments.reduce((sum, tx) => sum + tx.amount, 0) / 3
        : 0;
    const monthlyIncome = totalIncome / 3;
    const dti = monthlyIncome > 0 ? monthlyRepayment / monthlyIncome : 0;

    return {
      userId: consent.userId,
      period: {
        from: threeMonthsAgo,
        to: now,
        months: 3,
      },
      income: {
        totalIncome,
        monthlyAvgIncome: totalIncome / 3,
        salaryIncome,
        otherIncome: totalIncome - salaryIncome,
        incomeStability,
        salaryDay,
      },
      expenses: {
        totalExpenses,
        monthlyAvgExpenses: totalExpenses / 3,
        essentialExpenses,
        discretionaryExpenses,
        savingsRate:
          monthlyIncome > 0
            ? (monthlyIncome - totalExpenses / 3) / monthlyIncome
            : 0,
      },
      balance: {
        currentBalance: totalBalance,
        avgBalance: totalBalance * 0.85, // Approximate
        minBalance: totalBalance * 0.6,
        totalAccounts: accounts.length,
        hasSavingsAccount: accounts.some((a) => a.accountType === 'SAVINGS'),
      },
      behavior: {
        totalTransactions: allTransactions.length,
        avgTransactionsPerMonth: allTransactions.length / 3,
        regularPayments: debits.filter(
          (tx) =>
            tx.category === TransactionCategory.BILL_PAYMENT ||
            tx.category === TransactionCategory.INSURANCE,
        ).length,
        overdraftCount: 0,
        bounceCount: 0,
      },
      existingDebt: {
        hasLoanRepayments: loanRepayments.length > 0,
        estimatedMonthlyRepayment: monthlyRepayment,
        debtToIncomeRatio: dti,
      },
      dataQuality: 'MEDIUM',
      dataSource: 'MOCK',
      analyzedAt: new Date(),
    };
  }

  // ==========================================
  // PRIVATE: Data Generation
  // ==========================================

  private generateMockAccounts(bankCode: string): OBAccountInfo[] {
    const bankNames: Record<string, string> = {
      VCB: 'Vietcombank',
      TCB: 'Techcombank',
      MB: 'MBBank',
      ICB: 'VietinBank',
      BIDV: 'BIDV',
      VPB: 'VPBank',
      ACB: 'ACB',
      TPB: 'TPBank',
      HDB: 'HDBank',
    };
    const bankName = bankNames[bankCode] || bankCode;

    // Mỗi bank link tạo 1 checking + possibly 1 savings
    const accounts: OBAccountInfo[] = [
      {
        accountId: `ob_${bankCode.toLowerCase()}_checking`,
        bankCode,
        bankName,
        accountNumber: this.randomAccountNumber(),
        accountName: 'NGUYEN VAN QUANG',
        accountType: 'CURRENT',
        currency: 'VND',
        balance: this.randomBetween(30_000_000, 200_000_000),
        availableBalance: 0,
        lastSyncedAt: new Date(),
      },
    ];
    accounts[0].availableBalance =
      accounts[0].balance - this.randomBetween(0, 1_000_000);

    // 40% chance có thêm savings account
    if (Math.random() < 0.4) {
      const savingsBalance = this.randomBetween(50_000_000, 500_000_000);
      accounts.push({
        accountId: `ob_${bankCode.toLowerCase()}_savings`,
        bankCode,
        bankName,
        accountNumber: this.randomAccountNumber(),
        accountName: 'NGUYEN VAN QUANG',
        accountType: 'SAVINGS',
        currency: 'VND',
        balance: savingsBalance,
        availableBalance: savingsBalance,
        lastSyncedAt: new Date(),
      });
    }

    return accounts;
  }

  /**
   * Tạo giao dịch mock thực tế (3-6 tháng)
   * Quan trọng: Mô phỏng pattern thật để credit scoring hoạt động đúng
   */
  private generateMockTransactions(
    accountId: string,
    fromDate: Date,
    toDate: Date,
  ): OBTransaction[] {
    const transactions: OBTransaction[] = [];
    const current = new Date(fromDate);
    let txCounter = 1;

    while (current <= toDate) {
      const dayOfMonth = current.getDate();
      const monthStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;

      // === LƯƠNG (ngày 25-28 hàng tháng) ===
      if (dayOfMonth >= 25 && dayOfMonth <= 28) {
        // Chỉ tạo 1 lần/tháng (ngày 25)
        if (dayOfMonth === 25) {
          const salary = this.randomBetween(15_000_000, 35_000_000);
          transactions.push(
            this.makeTx(
              txCounter++,
              accountId,
              salary,
              'CREDIT',
              TransactionCategory.SALARY,
              `LUONG THANG ${monthStr} - CTY TNHH CONG NGHE ABC`,
              'CTY TNHH CONG NGHE ABC',
              current,
            ),
          );
        }
      }

      // === HÓA ĐƠN ĐỊNH KỲ (đầu tháng) ===
      if (dayOfMonth === 1 || dayOfMonth === 2) {
        // Tiền điện (500k-1.5tr)
        if (dayOfMonth === 1) {
          transactions.push(
            this.makeTx(
              txCounter++,
              accountId,
              this.randomBetween(500_000, 1_500_000),
              'DEBIT',
              TransactionCategory.BILL_PAYMENT,
              `THANH TOAN TIEN DIEN T${current.getMonth() + 1}`,
              'EVN',
              current,
            ),
          );
        }
        // Tiền nước (100k-300k)
        if (dayOfMonth === 2) {
          transactions.push(
            this.makeTx(
              txCounter++,
              accountId,
              this.randomBetween(100_000, 300_000),
              'DEBIT',
              TransactionCategory.BILL_PAYMENT,
              `THANH TOAN TIEN NUOC T${current.getMonth() + 1}`,
              'CONG TY NUOC SACH',
              current,
            ),
          );
        }
      }

      // === INTERNET / ĐIỆN THOẠI (ngày 5) ===
      if (dayOfMonth === 5) {
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(200_000, 500_000),
            'DEBIT',
            TransactionCategory.BILL_PAYMENT,
            'THANH TOAN INTERNET VIETTEL',
            'VIETTEL',
            current,
          ),
        );
      }

      // === BẢO HIỂM (ngày 10, hàng tháng) ===
      if (dayOfMonth === 10 && Math.random() < 0.6) {
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(500_000, 2_000_000),
            'DEBIT',
            TransactionCategory.INSURANCE,
            'DONG PHI BAO HIEM NHAN THO',
            'MANULIFE VN',
            current,
          ),
        );
      }

      // === MUA SẮM (2-3 lần/tuần) ===
      if (Math.random() < 0.35) {
        const shops = [
          'SHOPEE VN',
          'LAZADA VN',
          'TIKI',
          'SENDO',
          'WINMART',
          'BIG C',
          'LOTTE MART',
        ];
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(50_000, 2_000_000),
            'DEBIT',
            TransactionCategory.SHOPPING,
            `MUA SAM TAI ${this.randomItem(shops)}`,
            this.randomItem(shops),
            current,
          ),
        );
      }

      // === ĂN UỐNG (gần như hàng ngày) ===
      if (Math.random() < 0.5) {
        const foods = [
          'GRAB FOOD',
          'SHOPEE FOOD',
          'NOW VN',
          'HIGHLANDS COFFEE',
          'THE COFFEE HOUSE',
        ];
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(30_000, 300_000),
            'DEBIT',
            TransactionCategory.FOOD,
            `THANH TOAN ${this.randomItem(foods)}`,
            this.randomItem(foods),
            current,
          ),
        );
      }

      // === DI CHUYỂN (Grab/Be) ===
      if (Math.random() < 0.3) {
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(15_000, 150_000),
            'DEBIT',
            TransactionCategory.TRANSPORT,
            'THANH TOAN GRAB',
            'GRAB VN',
            current,
          ),
        );
      }

      // === CHUYỂN KHOẢN NHẬN (không định kỳ) ===
      if (Math.random() < 0.1) {
        const names = ['TRAN VAN B', 'LE THI C', 'PHAM VAN D', 'NGUYEN THI E'];
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(500_000, 10_000_000),
            'CREDIT',
            TransactionCategory.TRANSFER_IN,
            `NHAN TIEN TU ${this.randomItem(names)}`,
            this.randomItem(names),
            current,
          ),
        );
      }

      // === CHUYỂN KHOẢN ĐI (không định kỳ) ===
      if (Math.random() < 0.08) {
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(500_000, 5_000_000),
            'DEBIT',
            TransactionCategory.TRANSFER_OUT,
            'CHUYEN TIEN CHO BAN',
            'NGUYEN VAN X - BIDV',
            current,
          ),
        );
      }

      // === TRẢ NỢ VAY (nếu có - ngày 15) ===
      if (dayOfMonth === 15 && Math.random() < 0.3) {
        transactions.push(
          this.makeTx(
            txCounter++,
            accountId,
            this.randomBetween(2_000_000, 8_000_000),
            'DEBIT',
            TransactionCategory.LOAN_REPAYMENT,
            'TRA NO VAY TIN CHAP - VPBANK',
            'VPBANK',
            current,
          ),
        );
      }

      current.setDate(current.getDate() + 1);
    }

    // Sắp xếp theo ngày mới nhất
    return transactions.sort(
      (a, b) =>
        new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime(),
    );
  }

  // ===== Helpers =====

  private makeTx(
    id: number,
    accountId: string,
    amount: number,
    type: 'CREDIT' | 'DEBIT',
    category: TransactionCategory,
    description: string,
    counterparty: string,
    date: Date,
  ): OBTransaction {
    return {
      transactionId: `tx_mock_${id.toString().padStart(5, '0')}`,
      accountId,
      amount,
      currency: 'VND',
      type,
      category,
      description,
      counterpartyName: counterparty,
      referenceNumber: `REF${Date.now()}${id}`,
      bookingDate: new Date(date),
      valueDate: new Date(date),
      status: 'BOOKED',
    };
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomAccountNumber(): string {
    return String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
  }

  private randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private groupByMonth(transactions: OBTransaction[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      const d = new Date(tx.bookingDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      map.set(key, (map.get(key) || 0) + tx.amount);
    }
    return map;
  }

  private calculateStability(monthlyValues: Map<string, number>): number {
    const values = Array.from(monthlyValues.values());
    if (values.length < 2) return 0.5;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    if (avg === 0) return 0;
    const variance =
      values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
    const cv = Math.sqrt(variance) / avg; // Coefficient of variation
    return Math.max(0, Math.min(1, 1 - cv)); // Lower CV = higher stability
  }

  private mostFrequent(arr: number[]): number | undefined {
    if (arr.length === 0) return undefined;
    const freq = new Map<number, number>();
    for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
    let maxFreq = 0,
      maxVal = arr[0];
    for (const [val, count] of freq) {
      if (count > maxFreq) {
        maxFreq = count;
        maxVal = val;
      }
    }
    return maxVal;
  }
}
