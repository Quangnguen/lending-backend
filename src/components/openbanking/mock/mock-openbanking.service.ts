import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { MOCK_ACCOUNTS, MOCK_TRANSACTIONS } from './vn-banks.data';
import { VietQRService } from '../vietqr.service';
import { OpenBankingService } from '../openbanking.service';
import {
  LinkBankDto,
  VerifyOtpDto,
  BankConnectionResponse,
  BankAccount,
  BankTransaction,
  Bank,
} from '../dto/openbanking.dto';

@Injectable()
export class MockOpenBankingService {
  private readonly logger = new Logger(MockOpenBankingService.name);

  // Lưu trữ tạm các phiên OTP trong bộ nhớ Ram
  // key: transactionId, value: {bankCode, accountNumber, accountName, timestamp}
  private otpSessions = new Map<
    string,
    {
      bankCode: string;
      accountNumber: string;
      accountName: string;
      timestamp: number;
    }
  >();

  constructor(
    private readonly vietqrService: VietQRService,
    private readonly openBankingService: OpenBankingService,
  ) {}

  /**
   * 1. Lấy danh sách ngân hàng - dùng VietQR API thật
   */
  async getBanks(): Promise<Bank[]> {
    return this.vietqrService.getBanks();
  }

  /**
   * 2. Bước 1: Yêu cầu liên kết ngân hàng
   * Trong thực tế sẽ gọi API của ngân hàng, ở đây mock OTP flow
   */
  async initiateLink(dto: LinkBankDto): Promise<BankConnectionResponse> {
    const { bankCode, accountNumber, accountName } = dto;

    // Validate bank exists in VietQR
    const bank = await this.vietqrService.findBankByCode(bankCode);
    if (!bank) {
      throw new BadRequestException(
        `Ngân hàng với mã ${bankCode} không tồn tại`,
      );
    }

    // Tạo phiên OTP
    const transactionId = `link_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Lưu session (5 phút)
    this.otpSessions.set(transactionId, {
      bankCode,
      accountNumber,
      accountName,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: `Mã OTP đã gửi đến số điện thoại đăng ký tại ${bank.shortName}. (Demo: nhập 123456)`,
      transactionId,
    };
  }

  /**
   * 3. Bước 2: Xác thực OTP
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    userId?: string,
  ): Promise<BankConnectionResponse> {
    const { transactionId, otp } = dto;

    // Check transactionId
    const session = this.otpSessions.get(transactionId);
    if (!session) {
      throw new BadRequestException(
        'Phiên liên kết không hợp lệ hoặc đã hết hạn',
      );
    }

    // Kiểm tra hết hạn (5 phút)
    if (Date.now() - session.timestamp > 5 * 60 * 1000) {
      this.otpSessions.delete(transactionId);
      throw new BadRequestException('Mã OTP đã hết hạn, vui lòng thử lại');
    }

    // Mock OTP check - demo dùng mã 123456
    if (otp === '123456') {
      this.otpSessions.delete(transactionId);

      // Tạo mock account cho user
      const bank = await this.vietqrService.findBankByCode(session.bankCode);

      const newAccount: BankAccount = {
        id: `acc_${session.bankCode.toLowerCase()}_${Date.now()}`,
        bankId: session.bankCode,
        bankName: bank?.shortName,
        bankLogo: bank?.logo,
        accountNumber: session.accountNumber,
        accountName: session.accountName,
        balance: Math.floor(Math.random() * 100000000) + 10000000, // Random 10-110tr
        currency: 'VND',
        type: 'CURRENT',
      };

      // Lưu account vào MOCK_ACCOUNTS để getAccounts() trả về
      // Sử dụng userId làm key để phân tách dữ liệu giữa các user
      const accountKey = userId || 'anonymous';
      if (!MOCK_ACCOUNTS[accountKey]) {
        MOCK_ACCOUNTS[accountKey] = [];
      }
      const existingIndex = MOCK_ACCOUNTS[accountKey].findIndex(
        (acc) =>
          acc.bankId === session.bankCode &&
          acc.accountNumber === session.accountNumber,
      );
      if (existingIndex >= 0) {
        MOCK_ACCOUNTS[accountKey][existingIndex] = newAccount;
      } else {
        MOCK_ACCOUNTS[accountKey].push(newAccount);
      }

      // === PERSIST vào MongoDB (kèm balance) ===
      if (userId) {
        try {
          await this.openBankingService.createConnection(
            userId,
            session.bankCode,
            session.accountNumber,
            session.accountName,
            newAccount.balance, // Lưu balance vào DB
            'VND',
            'CURRENT',
          );
          this.logger.log(
            `✅ Persisted bank connection (balance: ${newAccount.balance}) to MongoDB for user ${userId}`,
          );
        } catch (err) {
          this.logger.warn(
            `⚠️ Failed to persist bank connection to MongoDB: ${err.message}`,
          );
          // Không throw - mock flow vẫn thành công
        }
      }

      return {
        success: true,
        message: `Liên kết ${bank?.shortName} thành công`,
        data: {
          linkedAccount: newAccount,
        },
      };
    }

    throw new BadRequestException('Mã OTP không đúng');
  }

  /**
   * 4. Lấy danh sách tài khoản đã liên kết
   */
  async getAccounts(username: string): Promise<BankAccount[]> {
    const accounts = MOCK_ACCOUNTS[username] || [];

    // Enrich with bank info from VietQR
    const enrichedAccounts = await Promise.all(
      accounts.map(async (acc) => {
        const bank = await this.vietqrService.findBankByCode(acc.bankId);
        return {
          ...acc,
          bankName: bank?.shortName,
          bankLogo: bank?.logo,
        };
      }),
    );

    return enrichedAccounts;
  }

  /**
   * 5. Lấy lịch sử giao dịch
   */
  async getTransactions(accountId: string): Promise<BankTransaction[]> {
    return MOCK_TRANSACTIONS[accountId] || [];
  }

  /**
   * 6. Tính điểm tín dụng dựa trên tài khoản ngân hàng
   */
  async calculateCreditScore(username: string): Promise<{
    score: number;
    rating: string;
    loanLimit: number;
    breakdown: {
      balanceScore: number;
      accountsScore: number;
      transactionScore: number;
    };
  }> {
    const accounts = MOCK_ACCOUNTS[username] || [];
    if (accounts.length === 0) {
      return {
        score: 0,
        rating: 'Chưa có dữ liệu',
        loanLimit: 0,
        breakdown: { balanceScore: 0, accountsScore: 0, transactionScore: 0 },
      };
    }

    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const numAccounts = accounts.length;

    // Tính điểm dựa trên số dư
    let balanceScore = 0;
    if (totalBalance > 100_000_000) balanceScore = 400;
    else if (totalBalance > 50_000_000) balanceScore = 300;
    else if (totalBalance > 20_000_000) balanceScore = 200;
    else if (totalBalance > 5_000_000) balanceScore = 100;

    // Tính điểm dựa trên số tài khoản
    const accountsScore = Math.min(numAccounts * 50, 200);

    // Tính điểm dựa trên lịch sử giao dịch
    let transactionScore = 0;
    for (const acc of accounts) {
      const txs = MOCK_TRANSACTIONS[acc.id] || [];
      transactionScore += Math.min(txs.length * 30, 200);
    }
    transactionScore = Math.min(transactionScore, 400);

    const totalScore = Math.min(
      balanceScore + accountsScore + transactionScore,
      1000,
    );

    // Rating
    let rating: string;
    let loanLimit: number;
    if (totalScore >= 800) {
      rating = 'Xuất sắc';
      loanLimit = 500_000_000;
    } else if (totalScore >= 600) {
      rating = 'Tốt';
      loanLimit = 200_000_000;
    } else if (totalScore >= 400) {
      rating = 'Trung bình';
      loanLimit = 50_000_000;
    } else {
      rating = 'Thấp';
      loanLimit = 10_000_000;
    }

    return {
      score: totalScore,
      rating,
      loanLimit,
      breakdown: {
        balanceScore,
        accountsScore,
        transactionScore,
      },
    };
  }
}
