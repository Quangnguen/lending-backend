import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OBFinancialSummary,
  OBTransaction,
  OBAccountInfo,
  TransactionCategory,
} from './providers/openbanking-provider.interface';
import { MockOpenBankingProvider } from './providers/mock-openbanking.provider';
import { OpenBankingService } from './openbanking.service';

/**
 * FinancialAnalyzerService — Cầu nối giữa Open Banking data → Credit Scoring
 * 
 * Chức năng:
 * 1. Thu thập dữ liệu giao dịch từ OpenBanking Provider (hiện tại: Mock)
 * 2. Phân loại giao dịch (categorization) - detect lương, hóa đơn, nợ
 * 3. Tạo Financial Summary tổng hợp
 * 4. Lưu trữ snapshot vào MongoDB để audit trail
 * 
 * Trong thiết kế:
 *   User liên kết NH → Provider lấy transactions → Analyzer phân tích 
 *   → CreditService tính score → (tương lai) Oracle đẩy lên Blockchain
 */
@Injectable()
export class FinancialAnalyzerService {
  private readonly logger = new Logger(FinancialAnalyzerService.name);

  constructor(
    private readonly mockProvider: MockOpenBankingProvider,
    private readonly openBankingService: OpenBankingService,
  ) {}

  /**
   * Phân tích tài chính cho user dựa trên dữ liệu Open Banking
   * 
   * Flow:
   * 1. Kiểm tra user có bank connection chưa
   * 2. Nếu có consent → lấy transactions từ provider
   * 3. Phân tích & tạo Financial Summary
   * 4. Return để CreditService sử dụng
   */
  async analyzeUserFinancials(
    userId: string,
    consentId?: string,
  ): Promise<OBFinancialSummary> {
    this.logger.log(`Analyzing financials for user ${userId}`);

    // Nếu có consentId → dùng provider trực tiếp
    if (consentId) {
      return this.mockProvider.analyzeFinancials(consentId);
    }

    // Fallback: Kiểm tra bank connections trong MongoDB
    const bankConnections = await this.openBankingService.getUserConnections(userId);

    if (bankConnections && bankConnections.length > 0) {
      this.logger.log(`User ${userId} has ${bankConnections.length} bank connection(s) - creating consent for analysis`);

      // Tạo consent tạm cho mỗi bank connection và thu thập dữ liệu
      const allAccounts: OBAccountInfo[] = [];
      const allTransactions: OBTransaction[] = [];
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
      const now = new Date();

      for (const conn of bankConnections) {
        try {
          // Initiate + auto-confirm consent cho mock
          const { consentId: autoConsentId } = await this.mockProvider.initiateConsent(
            userId,
            conn.bankCode,
            [],
          );
          await this.mockProvider.confirmConsent(autoConsentId, '123456');

          const accounts = await this.mockProvider.getAccounts(autoConsentId);
          allAccounts.push(...accounts);

          for (const acc of accounts) {
            const { transactions } = await this.mockProvider.getTransactions(
              autoConsentId, acc.accountId, threeMonthsAgo, now, 1, 500,
            );
            allTransactions.push(...transactions);
          }
        } catch (err) {
          this.logger.warn(`Failed to analyze bank ${conn.bankCode}: ${err.message}`);
        }
      }

      // Tạo financial summary từ dữ liệu thu thập
      return this.buildFinancialSummary(userId, allAccounts, allTransactions, 'HYBRID');
    }

    // Fallback cuối: Mock analysis không cần bank connection
    this.logger.warn(`User ${userId} has no bank connections - using pure mock analysis`);
    return this.buildFallbackSummary(userId);
  }

  /**
   * Phân loại giao dịch tự động bằng keyword matching
   * Trong thực tế: sử dụng ML model hoặc rule engine phức tạp hơn
   */
  categorizeTransaction(description: string, amount: number): TransactionCategory {
    const desc = description.toUpperCase();

    // Lương
    if (desc.includes('LUONG') || desc.includes('SALARY') || desc.includes('WAGE')) {
      return TransactionCategory.SALARY;
    }

    // Hóa đơn
    if (desc.includes('DIEN') || desc.includes('NUOC') || desc.includes('INTERNET') ||
        desc.includes('DIEN THOAI') || desc.includes('EVN') || desc.includes('VIETTEL')) {
      return TransactionCategory.BILL_PAYMENT;
    }

    // Bảo hiểm
    if (desc.includes('BAO HIEM') || desc.includes('INSURANCE') || desc.includes('MANULIFE') ||
        desc.includes('PRUDENTIAL') || desc.includes('AIA')) {
      return TransactionCategory.INSURANCE;
    }

    // Trả nợ
    if (desc.includes('TRA NO') || desc.includes('LOAN') || desc.includes('VAY') ||
        desc.includes('KHOAN NO')) {
      return TransactionCategory.LOAN_REPAYMENT;
    }

    // Mua sắm
    if (desc.includes('SHOPEE') || desc.includes('LAZADA') || desc.includes('TIKI') ||
        desc.includes('MUA SAM') || desc.includes('WINMART') || desc.includes('BIG C')) {
      return TransactionCategory.SHOPPING;
    }

    // Ăn uống
    if (desc.includes('FOOD') || desc.includes('COFFEE') || desc.includes('NHA HANG') ||
        desc.includes('HIGHLANDS') || desc.includes('GRAB FOOD')) {
      return TransactionCategory.FOOD;
    }

    // Di chuyển
    if (desc.includes('GRAB') || desc.includes('BE') || desc.includes('TAXI') ||
        desc.includes('XANG')) {
      return TransactionCategory.TRANSPORT;
    }

    // Tiết kiệm
    if (desc.includes('TIET KIEM') || desc.includes('SAVINGS') || desc.includes('GUI')) {
      return TransactionCategory.SAVINGS;
    }

    // Chuyển khoản
    if (desc.includes('CHUYEN TIEN') || desc.includes('TRANSFER')) {
      return amount > 0 ? TransactionCategory.TRANSFER_IN : TransactionCategory.TRANSFER_OUT;
    }

    return TransactionCategory.OTHER;
  }

  // ===== Private Helpers =====

  private buildFinancialSummary(
    userId: string,
    accounts: OBAccountInfo[],
    transactions: OBTransaction[],
    dataSource: 'REAL_API' | 'MOCK' | 'HYBRID',
  ): OBFinancialSummary {
    const credits = transactions.filter(tx => tx.type === 'CREDIT');
    const debits = transactions.filter(tx => tx.type === 'DEBIT');
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);

    const totalIncome = credits.reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpenses = debits.reduce((sum, tx) => sum + tx.amount, 0);
    const salaryTx = credits.filter(tx => tx.category === TransactionCategory.SALARY);
    const salaryIncome = salaryTx.reduce((sum, tx) => sum + tx.amount, 0);
    const monthlyIncome = totalIncome / 3;

    // Essential vs discretionary
    const essentialCategories = [
      TransactionCategory.BILL_PAYMENT,
      TransactionCategory.TRANSPORT,
      TransactionCategory.INSURANCE,
      TransactionCategory.LOAN_REPAYMENT,
    ];
    const essentialExpenses = debits
      .filter(tx => essentialCategories.includes(tx.category))
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Loan repayments
    const loanTx = debits.filter(tx => tx.category === TransactionCategory.LOAN_REPAYMENT);
    const monthlyRepayment = loanTx.reduce((sum, tx) => sum + tx.amount, 0) / 3;
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    return {
      userId,
      period: { from: threeMonthsAgo, to: new Date(), months: 3 },
      income: {
        totalIncome,
        monthlyAvgIncome: monthlyIncome,
        salaryIncome,
        otherIncome: totalIncome - salaryIncome,
        incomeStability: salaryTx.length >= 2 ? 0.85 : 0.5,
        salaryDay: 25,
      },
      expenses: {
        totalExpenses,
        monthlyAvgExpenses: totalExpenses / 3,
        essentialExpenses,
        discretionaryExpenses: totalExpenses - essentialExpenses,
        savingsRate: monthlyIncome > 0 ? Math.max(0, (monthlyIncome - totalExpenses / 3) / monthlyIncome) : 0,
      },
      balance: {
        currentBalance: totalBalance,
        avgBalance: totalBalance * 0.85,
        minBalance: totalBalance * 0.6,
        totalAccounts: accounts.length,
        hasSavingsAccount: accounts.some(a => a.accountType === 'SAVINGS'),
      },
      behavior: {
        totalTransactions: transactions.length,
        avgTransactionsPerMonth: transactions.length / 3,
        regularPayments: debits.filter(tx =>
          tx.category === TransactionCategory.BILL_PAYMENT ||
          tx.category === TransactionCategory.INSURANCE
        ).length,
        overdraftCount: 0,
        bounceCount: 0,
      },
      existingDebt: {
        hasLoanRepayments: loanTx.length > 0,
        estimatedMonthlyRepayment: monthlyRepayment,
        debtToIncomeRatio: monthlyIncome > 0 ? monthlyRepayment / monthlyIncome : 0,
      },
      dataQuality: transactions.length > 30 ? 'HIGH' : transactions.length > 10 ? 'MEDIUM' : 'LOW',
      dataSource,
      analyzedAt: new Date(),
    };
  }

  private buildFallbackSummary(userId: string): OBFinancialSummary {
    const now = new Date();
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);

    return {
      userId,
      period: { from: threeMonthsAgo, to: now, months: 3 },
      income: {
        totalIncome: 45_000_000,
        monthlyAvgIncome: 15_000_000,
        salaryIncome: 36_000_000,
        otherIncome: 9_000_000,
        incomeStability: 0.7,
        salaryDay: 25,
      },
      expenses: {
        totalExpenses: 30_000_000,
        monthlyAvgExpenses: 10_000_000,
        essentialExpenses: 12_000_000,
        discretionaryExpenses: 18_000_000,
        savingsRate: 0.33,
      },
      balance: {
        currentBalance: 50_000_000,
        avgBalance: 42_000_000,
        minBalance: 25_000_000,
        totalAccounts: 1,
        hasSavingsAccount: false,
      },
      behavior: {
        totalTransactions: 45,
        avgTransactionsPerMonth: 15,
        regularPayments: 4,
        overdraftCount: 0,
        bounceCount: 0,
      },
      existingDebt: {
        hasLoanRepayments: false,
        estimatedMonthlyRepayment: 0,
        debtToIncomeRatio: 0,
      },
      dataQuality: 'LOW',
      dataSource: 'MOCK',
      analyzedAt: now,
    };
  }
}
