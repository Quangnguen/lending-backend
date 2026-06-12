import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LoanRequest,
  LoanRequestDocument,
} from '@database/schemas/bank-request.model';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import {
  LoanRepayment,
  LoanRepaymentDocument,
} from '@database/schemas/loan-repayment.model';
import {
  LoanOffer,
  LoanOfferDocument,
} from '@database/schemas/loan-offer.model';
import { CreditService } from '../credit/credit.service';
import { CreditScoringEngine } from '../credit/credit-scoring.engine';
import { BlockchainService } from '../blockchain/blockchain.service';
import { OpenBankingService } from '../openbanking/openbanking.service';
import { MockOpenBankingService } from '../openbanking/mock/mock-openbanking.service';
import { VietQRService } from '../openbanking/vietqr.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationTypeEnum } from '../notification/enums/notification-type.enum';
import { CreateLoanRequestDto } from './dto/create-loan-request.dto';
import { FundLoanDto } from './dto/fund-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import { User, UserDocument } from '@database/schemas/user.model';
import {
  LOAN_REQUEST_STATUS_ENUM,
  LOAN_STATUS_ENUM,
  REPAYMENT_STATUS_ENUM,
  PAYMENT_METHOD_ENUM,
  KYC_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

@Injectable()
export class LoanService {
  private readonly logger = new Logger(LoanService.name);

  constructor(
    @InjectModel(LoanRequest.name)
    private loanRequestModel: Model<LoanRequestDocument>,
    @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
    @InjectModel(LoanRepayment.name)
    private repaymentModel: Model<LoanRepaymentDocument>,
    @InjectModel(LoanOffer.name) private offerModel: Model<LoanOfferDocument>,
    private creditService: CreditService,
    private creditScoringEngine: CreditScoringEngine,
    private blockchainService: BlockchainService,
    private openBankingService: OpenBankingService,
    private mockOpenBankingService: MockOpenBankingService,
    private vietQRService: VietQRService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationService: NotificationService,
  ) {}

  // ========================================
  // === BORROWER ===
  // ========================================

  /** Tạo yêu cầu vay mới */
  async createLoanRequest(userId: string, dto: CreateLoanRequestDto) {
    // 0. Xác thực điều kiện tiên quyết: KYC + Bank Connection
    await this.validateUserFlow(userId);

    // 1. Kiểm tra credit score
    let creditScore = await this.creditScoringEngine.getLatestScore(userId);
    if (!creditScore) {
      // Tự động tính credit score nếu chưa có
      try {
        creditScore = await this.creditScoringEngine.calculateScore(userId);
      } catch (error) {
        this.logger.warn(
          `Không thể tính credit score cho user ${userId}: ${error.message}`,
        );
      }
    }

    // 2. Validate loan amount vs credit limit (nếu có credit score)
    if (creditScore && creditScore.loanLimit > 0) {
      // Kiểm tra khoản vay đơn lẻ không vượt hạn mức
      if (dto.loanAmount > creditScore.loanLimit) {
        throw new BadRequestException(
          `Số tiền vay (${dto.loanAmount} USDT) vượt quá hạn mức tín dụng (${creditScore.loanLimit} USDT). ` +
            `Credit Score: ${creditScore.score}/1000, Rating: ${creditScore.rating}`,
        );
      }

      // Tính tổng dư nợ hiện tại (pending requests + active/overdue loans)
      const [pendingRequests, activeLoans] = await Promise.all([
        this.loanRequestModel
          .find({
            borrowerId: new Types.ObjectId(userId),
            status: LOAN_REQUEST_STATUS_ENUM.PENDING,
          })
          .lean(),
        this.loanModel
          .find({
            borrowerId: new Types.ObjectId(userId),
            status: {
              $in: [LOAN_STATUS_ENUM.ACTIVE, LOAN_STATUS_ENUM.OVERDUE],
            },
          })
          .lean(),
      ]);

      const totalPending = pendingRequests.reduce(
        (sum, req) => sum + (parseFloat(req.loanAmount?.toString()) || 0),
        0,
      );
      const totalActive = activeLoans.reduce(
        (sum, loan) =>
          sum +
          (parseFloat(loan.remainingAmount?.toString()) ||
            parseFloat(loan.principalAmount?.toString()) ||
            0),
        0,
      );
      const totalOutstanding = totalPending + totalActive;

      if (totalOutstanding + dto.loanAmount > creditScore.loanLimit) {
        const availableAmount = Math.max(
          0,
          creditScore.loanLimit - totalOutstanding,
        );
        throw new BadRequestException(
          `Vượt hạn mức tín dụng. ` +
            `Hạn mức: ${creditScore.loanLimit} USDT, ` +
            `Đang vay/chờ duyệt: ${Math.round(totalOutstanding)} USDT, ` +
            `Còn khả dụng: ${Math.round(availableAmount)} USDT.`,
        );
      }

      // Giới hạn tối đa 3 request pending
      if (pendingRequests.length >= 3) {
        throw new BadRequestException(
          'Bạn đã có 3 yêu cầu vay đang chờ. Vui lòng chờ xử lý hoặc hủy bớt.',
        );
      }
    } else {
      // Không có credit score → vẫn giới hạn số pending requests
      const pendingCount = await this.loanRequestModel.countDocuments({
        borrowerId: new Types.ObjectId(userId),
        status: LOAN_REQUEST_STATUS_ENUM.PENDING,
      });
      if (pendingCount >= 3) {
        throw new BadRequestException(
          'Bạn đã có 3 yêu cầu vay đang chờ. Vui lòng chờ xử lý hoặc hủy bớt.',
        );
      }
    }

    // 3. Kiểm tra liên kết ngân hàng (khuyến nghị)
    let bankConnectionInfo = null;
    try {
      const bankConnections =
        await this.openBankingService.getUserConnections(userId);
      if (bankConnections && bankConnections.length > 0) {
        bankConnectionInfo = {
          linkedBanks: bankConnections.length,
          primaryBank: bankConnections[0].bankName,
        };
        this.logger.log(
          `User ${userId} has ${bankConnections.length} linked bank(s)`,
        );
      } else {
        this.logger.warn(
          `User ${userId} chưa liên kết ngân hàng - khuyến nghị liên kết để tăng credit score`,
        );
      }
    } catch (error) {
      this.logger.warn(`Không thể kiểm tra bank connections: ${error.message}`);
    }

    // 4. Tạo LoanRequest trong MongoDB
    const loanRequest = await this.loanRequestModel.create({
      borrowerId: new Types.ObjectId(userId),
      loanAmount: dto.loanAmount,
      interestRate: dto.interestRate,
      durationDays: dto.durationDays,
      purpose: dto.purpose,
      purposeDescription: dto.purposeDescription,
      collateralType: dto.collateralType,
      collateralAmount: dto.collateralAmount || 0,
      status: LOAN_REQUEST_STATUS_ENUM.PENDING,
      onChainRequestId: dto.onChainRequestId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày
    });

    this.logger.log(
      `Yêu cầu vay mới: ${loanRequest._id} - ${dto.loanAmount} USDT - User: ${userId}`,
    );

    return {
      success: true,
      data: loanRequest,
      creditScore: creditScore
        ? {
            score: creditScore.score,
            rating: creditScore.rating,
            loanLimit: creditScore.loanLimit,
          }
        : null,
      bankConnection: bankConnectionInfo,
      message: 'Tạo yêu cầu vay thành công',
    };
  }

  /** Lấy danh sách yêu cầu vay của user */
  async getMyLoanRequests(userId: string) {
    return this.loanRequestModel
      .find({ borrowerId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Lấy danh sách khoản vay đang active của borrower */
  async getMyLoans(userId: string) {
    return this.loanModel
      .find({
        $or: [
          { borrowerId: new Types.ObjectId(userId) },
          { lenderId: new Types.ObjectId(userId) },
        ],
      })
      .sort({ createdAt: -1 })
      .populate('borrowerId', 'fullName email avatarUrl walletAddress')
      .populate('lenderId', 'fullName email avatarUrl walletAddress')
      .lean();
  }

  /** Cập nhật yêu cầu vay (chỉ khi pending) */
  async updateLoanRequest(
    userId: string,
    requestId: string,
    dto: Partial<CreateLoanRequestDto>,
  ) {
    const request = await this.loanRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Yêu cầu vay không tồn tại');
    }

    // Chỉ chủ sở hữu mới được sửa
    if (request.borrowerId.toString() !== userId.toString()) {
      throw new ForbiddenException('Bạn không có quyền sửa yêu cầu vay này');
    }

    // Có thể sửa khi pending hoặc approved (miễn là chưa funded/active)
    const allowedStatuses = [
      LOAN_REQUEST_STATUS_ENUM.PENDING,
      LOAN_REQUEST_STATUS_ENUM.APPROVED,
    ];
    if (!allowedStatuses.includes(request.status)) {
      throw new BadRequestException(
        'Chỉ có thể sửa yêu cầu vay chưa được cấp vốn',
      );
    }

    // Cập nhật fields được phép
    if (dto.loanAmount !== undefined) request.loanAmount = dto.loanAmount;
    if (dto.interestRate !== undefined) request.interestRate = dto.interestRate;
    if (dto.durationDays !== undefined) request.durationDays = dto.durationDays;
    if (dto.purpose !== undefined) request.purpose = dto.purpose;
    if (dto.purposeDescription !== undefined)
      request.purposeDescription = dto.purposeDescription;

    // Tính lại collateral nếu loanAmount thay đổi (dùng dynamic ratio từ credit score)
    if (dto.loanAmount !== undefined) {
      try {
        // Lấy giá ETH từ blockchain service
        const ethPrice = await this.getEthPrice();
        // Dynamic collateral ratio từ credit score (thay vì hard-code 150%)
        const latestScore =
          await this.creditScoringEngine.getLatestScore(userId);
        const collateralPercent = latestScore
          ? this.creditScoringEngine.getRequiredCollateralRatio(
              latestScore.score,
            )
          : 150; // Fallback 150% nếu chưa có score
        const collateralRatio = collateralPercent / 100;
        const collateralValueUSD = dto.loanAmount * collateralRatio;
        const collateralETH = ethPrice > 0 ? collateralValueUSD / ethPrice : 0;
        request.collateralAmount = collateralETH;
        request.collateralValue = collateralValueUSD;
        this.logger.log(
          `Recalculated collateral: ${collateralETH} ETH (${collateralValueUSD} USD) | Ratio: ${collateralPercent}% for loan ${dto.loanAmount} USDT`,
        );
      } catch (error) {
        this.logger.warn(`Không thể tính lại collateral: ${error.message}`);
      }
    }

    // Reset expiry
    request.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await request.save();

    this.logger.log(`Cập nhật yêu cầu vay: ${requestId} - User: ${userId}`);

    return {
      success: true,
      data: request,
      message: 'Cập nhật yêu cầu vay thành công',
    };
  }

  /** Hủy/Xóa yêu cầu vay */
  async cancelLoanRequest(userId: string, requestId: string) {
    const request = await this.loanRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException('Yêu cầu vay không tồn tại');
    }

    // Chỉ chủ sở hữu mới được hủy
    if (request.borrowerId.toString() !== userId.toString()) {
      throw new ForbiddenException('Bạn không có quyền hủy yêu cầu vay này');
    }

    // Có thể hủy khi chưa funded
    const allowedStatuses = [
      LOAN_REQUEST_STATUS_ENUM.PENDING,
      LOAN_REQUEST_STATUS_ENUM.APPROVED,
    ];
    if (!allowedStatuses.includes(request.status)) {
      throw new BadRequestException(
        'Chỉ có thể hủy yêu cầu vay chưa được cấp vốn',
      );
    }

    request.status = LOAN_REQUEST_STATUS_ENUM.CANCELLED;
    await request.save();

    this.logger.log(`Hủy yêu cầu vay: ${requestId} - User: ${userId}`);

    return {
      success: true,
      message: 'Đã hủy yêu cầu vay thành công',
    };
  }

  /** Lấy giá ETH (USD) - helper */
  private async getEthPrice(): Promise<number> {
    try {
      const contractInfo = await this.blockchainService.getContractInfo();
      if (contractInfo?.ethPrice) {
        return contractInfo.ethPrice;
      }
    } catch (error) {
      this.logger.warn(
        `Không lấy được giá ETH từ blockchain: ${error.message}`,
      );
    }
    // Fallback: giá ETH mặc định cho Ganache demo
    return 2000;
  }

  // ========================================
  // === LENDER ===
  // ========================================

  /** Lấy danh sách yêu cầu vay đang chờ (marketplace) */
  async getPendingRequests(filters?: {
    minAmount?: number;
    maxAmount?: number;
    minRate?: number;
    maxRate?: number;
    purpose?: string;
    sort?: string;
  }) {
    const query: any = { status: LOAN_REQUEST_STATUS_ENUM.PENDING };

    // Filter theo số tiền
    if (filters?.minAmount || filters?.maxAmount) {
      query.loanAmount = {};
      if (filters.minAmount) query.loanAmount.$gte = filters.minAmount;
      if (filters.maxAmount) query.loanAmount.$lte = filters.maxAmount;
    }

    // Filter theo lãi suất
    if (filters?.minRate || filters?.maxRate) {
      query.interestRate = {};
      if (filters.minRate) query.interestRate.$gte = filters.minRate;
      if (filters.maxRate) query.interestRate.$lte = filters.maxRate;
    }

    // Filter theo mục đích
    if (filters?.purpose) {
      query.purpose = filters.purpose;
    }

    return this.loanRequestModel
      .find(query)
      .sort({ createdAt: -1 })
      .populate(
        'borrowerId',
        'fullName email avatarUrl creditScore reputationScore successfulLoans walletAddress',
      )
      .lean();
  }

  /** Cấp vốn cho khoản vay */
  async fundLoan(lenderId: string, requestId: string, dto: FundLoanDto) {
    // 0. Xác thực điều kiện tiên quyết: KYC + Bank Connection (Lender cũng cần KYC)
    await this.validateUserFlow(lenderId);

    // 1a. Kiểm tra on-chain TRƯỚC — đóng kẽ hở khi server sập sau khi blockchain đã xử lý
    // Nếu requestActive=false trên blockchain → khoản vay đã được fund dù DB chưa cập nhật
    if (dto.onChainRequestId != null) {
      const isActive = await this.blockchainService.isRequestActive(
        dto.onChainRequestId,
      );
      if (!isActive) {
        throw new BadRequestException(
          'Khoản vay đã được cấp vốn trên blockchain. Vui lòng làm mới danh sách.',
        );
      }
    }

    // 1b. Atomic check-and-lock: chỉ 1 lender thắng, tránh race condition
    // findOneAndUpdate với điều kiện status=PENDING đảm bảo chỉ 1 request thành công
    const request = await this.loanRequestModel.findOneAndUpdate(
      { _id: requestId, status: LOAN_REQUEST_STATUS_ENUM.PENDING },
      { $set: { status: LOAN_REQUEST_STATUS_ENUM.FUNDED } },
      { new: false }, // trả về document CŨ (trước khi update)
    );
    if (!request) {
      // Không tìm thấy = không tồn tại HOẶC đã được fund bởi lender khác
      const existing = await this.loanRequestModel.findById(requestId);
      if (!existing) throw new NotFoundException('Yêu cầu vay không tồn tại');
      throw new BadRequestException(
        `Yêu cầu vay đã được cấp vốn hoặc không còn khả dụng (trạng thái: ${existing.status})`,
      );
    }

    // Không cho phép tự cho mình vay (kiểm tra cả MongoDB ID)
    if (request.borrowerId.toString() === lenderId.toString()) {
      throw new ForbiddenException('Không thể cấp vốn cho chính mình');
    }

    // 2. Verify transaction on blockchain (nếu có txHash)
    if (dto.txHash) {
      const txVerification = await this.blockchainService.verifyTransaction(
        dto.txHash,
      );
      if (txVerification && !txVerification.isValid) {
        throw new BadRequestException(
          'Giao dịch blockchain không hợp lệ hoặc đã thất bại',
        );
      }
    }

    // 3. Tính toán (làm tròn 2 chữ số thập phân để khớp với frontend)
    const interestAmount =
      Math.round(
        ((request.loanAmount * request.interestRate * request.durationDays) /
          (365 * 100)) *
          100,
      ) / 100;
    const totalAmount =
      Math.round((request.loanAmount + interestAmount) * 100) / 100;

    // 4. Tạo Loan record
    const loan = await this.loanModel.create({
      requestId: request._id,
      borrowerId: request.borrowerId,
      lenderId: new Types.ObjectId(lenderId),
      principalAmount: request.loanAmount,
      interestRate: request.interestRate,
      totalInterest: interestAmount,
      totalAmount,
      durationDays: request.durationDays,
      startDate: new Date(),
      dueDate: new Date(
        Date.now() + request.durationDays * 24 * 60 * 60 * 1000,
      ),
      amountPaid: 0,
      remainingAmount: totalAmount,
      lateFee: 0,
      status: LOAN_STATUS_ENUM.ACTIVE,
      loanContractAddress: dto.loanContractAddress || null,
      fundTxHash: dto.txHash,
    });

    // 5. Status đã được update atomically ở bước 1 (findOneAndUpdate)

    // 6. Attach blockchain listener cho loan mới
    if (dto.loanContractAddress) {
      this.blockchainService.attachSingleLoanListener(dto.loanContractAddress);
    }

    // 7. Tạo thông báo cho người vay (kèm metadata để mobile navigate đúng màn hình)
    await this.notificationService.notifyLoanFunded({
      borrowerId: request.borrowerId.toString(),
      lenderId,
      loanId: loan._id.toString(),
      transactionHash: dto.txHash,
    });

    this.logger.log(
      `💰 Loan funded: ${loan._id} - ${request.loanAmount} USDT - Lender: ${lenderId}`,
    );

    return {
      success: true,
      data: loan,
      message: 'Cấp vốn thành công',
    };
  }

  /** Lấy danh sách đầu tư của lender */
  async getMyInvestments(userId: string) {
    return this.loanModel
      .find({ lenderId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .populate('borrowerId', 'fullName email avatarUrl creditScore')
      .lean();
  }

  /** Lấy lịch sử giao dịch gần đây (trả nợ, cấp vốn) */
  async getMyTransactions(userId: string) {
    const userIdObj = new Types.ObjectId(userId);

    // 1. Lấy tất cả khoản vay liên quan đến user
    const loans = await this.loanModel
      .find({
        $or: [{ borrowerId: userIdObj }, { lenderId: userIdObj }],
      })
      .populate('borrowerId lenderId', 'fullName')
      .lean();

    const loanIds = loans.map((l) => l._id);

    // 2. Lấy tất cả lịch sử trả nợ cho các khoản vay này
    const repayments = await this.repaymentModel
      .find({
        loanId: { $in: loanIds },
      })
      .lean();

    const transactions = [];

    // 3. Map giao dịch giải ngân (Funding)
    for (const loan of loans) {
      const isBorrower =
        loan.borrowerId?._id?.toString() === userId.toString() ||
        loan.borrowerId?.toString() === userId.toString();

      transactions.push({
        _id: `fund_${loan._id}`,
        type: isBorrower ? 'RECEIPT' : 'PAYMENT', // Nhận tiền giải ngân = RECEIPT, Cấp vốn = PAYMENT
        amount: loan.principalAmount,
        status: 'COMPLETED',
        date: loan.startDate || loan.createdAt,
        loanInfo: loan,
        txHash: loan.fundTxHash,
      });
    }

    // 4. Map giao dịch trả nợ (Repayment)
    for (const rp of repayments) {
      const loan = loans.find((l) => l._id.toString() === rp.loanId.toString());
      if (!loan) continue;

      const isPayer = rp.payerId?.toString() === userId.toString();

      transactions.push({
        _id: rp._id,
        type: isPayer ? 'PAYMENT' : 'RECEIPT', // Trả nợ = PAYMENT, Nhận nợ = RECEIPT
        amount: rp.totalAmount,
        status: rp.status,
        date: rp.paidAt || rp.createdAt,
        loanInfo: loan,
        txHash: rp.txHash,
      });
    }

    // 5. Sort theo ngày (mới nhất trước) và trả về max 10
    transactions.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return transactions.slice(0, 10);
  }

  // ========================================
  // === REPAYMENT ===
  // ========================================

  /** Trả nợ */
  async repayLoan(userId: string, loanId: string, dto: RepayLoanDto) {
    // 1. Validate loan
    // Tìm trực tiếp bằng Loan ID trước, nếu không có thì tìm bằng requestId
    let loan = await this.loanModel.findById(loanId);
    if (!loan) {
      // Fallback: frontend có thể truyền LoanRequest ID thay vì Loan ID
      loan = await this.loanModel.findOne({
        requestId: new Types.ObjectId(loanId),
      });
    }
    if (!loan) {
      throw new NotFoundException('Khoản vay không tồn tại');
    }

    // Chỉ borrower mới được trả nợ
    if (loan.borrowerId.toString() !== userId.toString()) {
      throw new ForbiddenException(
        'Bạn không phải người vay của khoản vay này',
      );
    }

    // Validate trạng thái
    if (
      ![
        LOAN_STATUS_ENUM.ACTIVE,
        LOAN_STATUS_ENUM.OVERDUE,
        LOAN_STATUS_ENUM.REPAID,
      ].includes(loan.status)
    ) {
      throw new BadRequestException(
        `Khoản vay không ở trạng thái có thể trả (hiện tại: ${loan.status})`,
      );
    }

    // 2. Verify transaction
    if (dto.txHash) {
      const txVerification = await this.blockchainService.verifyTransaction(
        dto.txHash,
      );
      if (txVerification && !txVerification.isValid) {
        throw new BadRequestException('Giao dịch blockchain không hợp lệ');
      }
    }

    // 3. Tính late fee nếu quá hạn
    let lateFee = 0;
    if (loan.dueDate && new Date() > loan.dueDate) {
      const daysLate = Math.ceil(
        (Date.now() - loan.dueDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      lateFee = Math.round(loan.principalAmount * 0.005 * daysLate * 100) / 100; // 0.5% / ngày
    }

    if (dto.amount < 0) {
      throw new BadRequestException('Số tiền thanh toán không hợp lệ');
    }

    // 4. Tạo repayment record (chỉ khi chưa REPAID, tránh duplicate)
    let repayment: any = null;
    if (loan.status !== LOAN_STATUS_ENUM.REPAID) {
      repayment = await this.repaymentModel.create({
        loanId: loan._id,
        payerId: new Types.ObjectId(userId),
        installmentNumber: 1,
        principalAmount: loan.principalAmount,
        interestAmount: loan.totalInterest,
        lateFeeAmount: lateFee,
        totalAmount: dto.amount,
        paymentMethod: PAYMENT_METHOD_ENUM.CRYPTO,
        status: REPAYMENT_STATUS_ENUM.COMPLETED,
        txHash: dto.txHash,
        paidAt: new Date(),
      });
    }

    // 5. Cập nhật loan
    // Luôn đánh dấu REPAID — contract enforce đúng số tiền on-chain
    // Nếu loan.loanContractAddress có (on-chain flow) hoặc loan đã REPAID trên chain
    // thì tin tưởng blockchain, không dùng off-chain math
    if (loan.loanContractAddress || loan.status === LOAN_STATUS_ENUM.REPAID) {
      loan.remainingAmount = 0;
      loan.status = LOAN_STATUS_ENUM.REPAID;
      if (dto.amount > 0) {
        loan.amountPaid =
          Math.round(((loan.amountPaid || 0) + dto.amount) * 100) / 100;
      }
    } else {
      // Legacy path (không có smart contract): dùng off-chain math
      loan.amountPaid =
        Math.round(((loan.amountPaid || 0) + dto.amount) * 100) / 100;
      const rawRemaining =
        (loan.remainingAmount !== undefined
          ? loan.remainingAmount
          : loan.totalAmount) - dto.amount;
      loan.remainingAmount = Math.max(0, Math.round(rawRemaining * 100) / 100);
      if (loan.remainingAmount < 0.01) {
        loan.status = LOAN_STATUS_ENUM.REPAID;
        loan.remainingAmount = 0;
      }
    }

    loan.lateFee = lateFee;
    if (dto.txHash) loan.repayTxHash = dto.txHash;
    loan.repaidAt = loan.repaidAt || new Date();

    await loan.save();

    // 6. Gửi thông báo cho Lender và Borrower kèm metadata
    if (loan.lenderId) {
      const isFullRepaid = loan.status === LOAN_STATUS_ENUM.REPAID;
      await this.notificationService.createAndSend(
        loan.lenderId.toString(),
        isFullRepaid
          ? '✅ Khoản đầu tư đã được tất toán!'
          : '💳 Nhận được thanh toán một phần',
        isFullRepaid
          ? `Người vay đã thanh toán toàn bộ ${loan.amountPaid} USDT. Vốn + lãi đã vào ví của bạn.`
          : `Người vay vừa thanh toán ${dto.amount} USDT. Dư nợ còn lại: ${loan.remainingAmount} USDT.`,
        NotificationTypeEnum.LOAN_REPAID,
        {
          loanId: loan._id.toString(),
          role: 'lender',
          screen: 'LoanDetail',
          transactionHash: dto.txHash,
        },
        loan._id.toString(),
      );
    }
    // Thông báo cho borrower xác nhận đã trả thành công
    await this.notificationService.createAndSend(
      loan.borrowerId.toString(),
      loan.status === LOAN_STATUS_ENUM.REPAID
        ? '🎉 Trả nợ hoàn tất!'
        : '✅ Đã ghi nhận thanh toán',
      loan.status === LOAN_STATUS_ENUM.REPAID
        ? 'Bạn đã hoàn tất toàn bộ khoản vay. Tài sản thế chấp sẽ được hoàn trả về ví của bạn.'
        : `Đã ghi nhận thanh toán ${dto.amount} USDT. Dư nợ còn lại: ${loan.remainingAmount} USDT.`,
      NotificationTypeEnum.LOAN_REPAID,
      {
        loanId: loan._id.toString(),
        role: 'borrower',
        screen: 'LoanDetail',
        transactionHash: dto.txHash,
      },
      loan._id.toString(),
    );

    this.logger.log(
      `✅ Loan repaid: ${loanId} - Amount: ${dto.amount} USDT - User: ${userId}`,
    );

    return {
      success: true,
      data: {
        loan,
        repayment,
        lateFee,
      },
      message:
        loan.status === LOAN_STATUS_ENUM.REPAID
          ? 'Trả nợ hoàn tất'
          : 'Đã ghi nhận thanh toán',
    };
  }

  // ========================================
  // === COMMON ===
  // ========================================

  /** Chi tiết khoản vay */
  async getLoanDetail(loanId: string) {
    let loan = await this.loanModel
      .findById(loanId)
      .populate(
        'borrowerId',
        'fullName email avatarUrl walletAddress creditScore',
      )
      .populate('lenderId', 'fullName email avatarUrl walletAddress')
      .populate('requestId', 'collateralAmount')
      .lean();

    // Fallback: tìm bằng requestId nếu không tìm thấy trực tiếp
    if (!loan) {
      loan = await this.loanModel
        .findOne({ requestId: new Types.ObjectId(loanId) })
        .populate(
          'borrowerId',
          'fullName email avatarUrl walletAddress creditScore',
        )
        .populate('lenderId', 'fullName email avatarUrl walletAddress')
        .populate('requestId', 'collateralAmount')
        .lean();
    }

    if (!loan) {
      throw new NotFoundException('Khoản vay không tồn tại');
    }

    // Lấy điểm tín dụng trực tiếp từ bảng CreditScore
    if (loan.borrowerId && (loan.borrowerId as any)._id) {
      const latestScore = await this.creditScoringEngine.getLatestScore(
        (loan.borrowerId as any)._id.toString(),
      );
      if (latestScore) {
        (loan.borrowerId as any).creditScoreDetail = latestScore;
        (loan.borrowerId as any).creditScore = latestScore.score;
      }
    }

    // Lấy thêm on-chain status nếu có contract address
    let onChainStatus = null;
    if (loan.loanContractAddress) {
      onChainStatus = await this.blockchainService.getLoanOnChainStatus(
        loan.loanContractAddress,
      );
    }

    // Lấy lịch sử repayment
    const repayments = await this.repaymentModel
      .find({ loanId: loan._id })
      .sort({ createdAt: -1 })
      .lean();

    // Extract collateralAmount từ requestId đã populate
    let collateralAmount = 0;
    if (
      loan.requestId &&
      (loan.requestId as any).collateralAmount !== undefined
    ) {
      const ca = (loan.requestId as any).collateralAmount;
      if (ca && ca.$numberDecimal) {
        collateralAmount = parseFloat(ca.$numberDecimal);
      } else {
        collateralAmount = parseFloat(ca.toString() || '0');
      }
    }

    return {
      ...loan,
      collateralAmount,
      onChainStatus,
      repayments,
    };
  }

  /** Chi tiết yêu cầu vay */
  async getLoanRequestDetail(requestId: string) {
    const request = await this.loanRequestModel
      .findById(requestId)
      .populate(
        'borrowerId',
        'fullName email avatarUrl creditScore reputationScore walletAddress',
      )
      .lean();

    if (!request) {
      throw new NotFoundException('Yêu cầu vay không tồn tại');
    }

    // Lấy điểm tín dụng trực tiếp từ bảng CreditScore
    if (request.borrowerId && (request.borrowerId as any)._id) {
      const latestScore = await this.creditScoringEngine.getLatestScore(
        (request.borrowerId as any)._id.toString(),
      );
      if (latestScore) {
        // Ghi đè creditScore từ bảng user bằng object chi tiết từ bảng creditscores
        (request.borrowerId as any).creditScoreDetail = latestScore;
        // Vẫn cập nhật số điểm vào field cũ để tránh lỗi UI hiện tại
        (request.borrowerId as any).creditScore = latestScore.score;
      }
    }

    return request;
  }

  // ========================================
  // === OPEN BANKING INTEGRATION ===
  // ========================================

  /**
   * Tạo QR Code trả nợ — Kết nối Open Banking với Loan Flow
   *
   * Luồng:
   * 1. Tìm khoản vay → lấy lenderId
   * 2. Tìm tài khoản NH của lender (đã liên kết qua Open Banking)
   * 3. Tạo QR VietQR với thông tin tài khoản lender
   * 4. Borrower quét mã QR để trả nợ trực tiếp cho lender
   */
  async generateRepaymentQR(userId: string, loanId: string) {
    // 1. Validate loan
    let loan = await this.loanModel
      .findById(loanId)
      .populate('lenderId', 'fullName')
      .lean();

    // Fallback: tìm bằng requestId
    if (!loan) {
      loan = await this.loanModel
        .findOne({ requestId: new Types.ObjectId(loanId) })
        .populate('lenderId', 'fullName')
        .lean();
    }

    if (!loan) {
      throw new NotFoundException('Khoản vay không tồn tại');
    }

    // Chỉ borrower mới có thể tạo QR trả nợ
    if (loan.borrowerId.toString() !== userId.toString()) {
      throw new ForbiddenException(
        'Bạn không phải người vay của khoản vay này',
      );
    }

    if (
      ![LOAN_STATUS_ENUM.ACTIVE, LOAN_STATUS_ENUM.OVERDUE].includes(loan.status)
    ) {
      throw new BadRequestException(
        `Khoản vay không ở trạng thái cần trả nợ (hiện tại: ${loan.status})`,
      );
    }

    // 2. Tìm tài khoản NH của lender
    const lenderConnections = await this.openBankingService.getUserConnections(
      loan.lenderId._id?.toString() || loan.lenderId.toString(),
    );

    if (!lenderConnections || lenderConnections.length === 0) {
      return {
        success: false,
        message:
          'Người cho vay chưa liên kết ngân hàng. Vui lòng trả nợ bằng crypto.',
        qrAvailable: false,
      };
    }

    // Dùng tài khoản NH đầu tiên của lender
    const lenderBank = lenderConnections[0];

    // 3. Tính số tiền cần trả (bao gồm late fee nếu có)
    let lateFee = 0;
    if (loan.dueDate && new Date() > loan.dueDate) {
      const daysLate = Math.ceil(
        (Date.now() - loan.dueDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      lateFee = loan.principalAmount * 0.005 * daysLate;
    }
    const totalAmount =
      loan.remainingAmount || loan.totalAmount - (loan.amountPaid || 0);
    const finalAmount = totalAmount + lateFee;

    // 4. Tạo QR VietQR
    const qrResult = await this.vietQRService.generateLoanPaymentQR(
      loanId,
      lenderBank.bankCode,
      lenderBank.accountNumberMask.replace('****', '0000'), // Demo: mask → example
      lenderBank.accountName,
      Math.round(finalAmount), // VND amount
    );

    this.logger.log(
      `📱 QR trả nợ cho loan ${loanId}: ${finalAmount} VND → ${lenderBank.bankName} (${lenderBank.accountName})`,
    );

    return {
      success: true,
      qrAvailable: true,
      qrData: qrResult,
      loanInfo: {
        loanId,
        principalAmount: loan.principalAmount,
        remainingAmount: totalAmount,
        lateFee,
        totalToRepay: finalAmount,
        lenderName: (loan.lenderId as any)?.fullName || 'Ẩn danh',
        lenderBank: {
          bankName: lenderBank.bankName,
          accountName: lenderBank.accountName,
          bankLogo: lenderBank.bankLogo,
        },
      },
      message: `Quét mã QR để trả nợ cho ${lenderBank.accountName} qua ${lenderBank.bankName}`,
    };
  }

  /**
   * Lấy thông tin Open Banking liên quan đến khoản vay
   * Trả về thông tin liên kết NH của cả borrower và lender
   */
  async getLoanBankInfo(userId: string, loanId: string) {
    let loan = await this.loanModel.findById(loanId).lean();
    // Fallback: tìm bằng requestId
    if (!loan) {
      loan = await this.loanModel
        .findOne({ requestId: new Types.ObjectId(loanId) })
        .lean();
    }
    if (!loan) {
      throw new NotFoundException('Khoản vay không tồn tại');
    }

    // Kiểm tra quyền truy cập (borrower hoặc lender)
    const isBorrower = loan.borrowerId.toString() === userId.toString();
    const isLender = loan.lenderId?.toString() === userId.toString();
    if (!isBorrower && !isLender) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin này');
    }

    // Lấy bank connections của cả 2 bên
    const [borrowerBanks, lenderBanks] = await Promise.all([
      this.openBankingService.getUserConnections(loan.borrowerId.toString()),
      loan.lenderId
        ? this.openBankingService.getUserConnections(loan.lenderId.toString())
        : Promise.resolve([]),
    ]);

    return {
      borrower: {
        hasLinkedBank: borrowerBanks.length > 0,
        bankCount: borrowerBanks.length,
        banks: borrowerBanks.map((b) => ({
          bankName: b.bankName,
          bankLogo: b.bankLogo,
          accountName: b.accountName,
        })),
      },
      lender: {
        hasLinkedBank: lenderBanks.length > 0,
        bankCount: lenderBanks.length,
        banks: lenderBanks.map((b) => ({
          bankName: b.bankName,
          bankLogo: b.bankLogo,
          accountName: b.accountName,
        })),
      },
      qrRepaymentAvailable: isLender
        ? false
        : isBorrower && lenderBanks.length > 0,
    };
  }

  // ========================================
  // === STATISTICS (cho Admin Dashboard) ===
  // ========================================

  async getLoanStats() {
    const [
      totalRequests,
      pendingRequests,
      fundedRequests,
      totalLoans,
      activeLoans,
      repaidLoans,
      overdueLoans,
      defaultedLoans,
    ] = await Promise.all([
      this.loanRequestModel.countDocuments(),
      this.loanRequestModel.countDocuments({
        status: LOAN_REQUEST_STATUS_ENUM.PENDING,
      }),
      this.loanRequestModel.countDocuments({
        status: LOAN_REQUEST_STATUS_ENUM.FUNDED,
      }),
      this.loanModel.countDocuments(),
      this.loanModel.countDocuments({ status: LOAN_STATUS_ENUM.ACTIVE }),
      this.loanModel.countDocuments({ status: LOAN_STATUS_ENUM.REPAID }),
      this.loanModel.countDocuments({ status: LOAN_STATUS_ENUM.OVERDUE }),
      this.loanModel.countDocuments({ status: LOAN_STATUS_ENUM.DEFAULTED }),
    ]);

    // Tính tổng giá trị
    const totalValueResult = await this.loanModel.aggregate([
      { $match: {} },
      {
        $group: {
          _id: null,
          totalPrincipal: { $sum: { $toDouble: '$principalAmount' } },
          totalInterest: { $sum: { $toDouble: '$totalInterest' } },
          totalPaid: { $sum: { $toDouble: '$amountPaid' } },
        },
      },
    ]);

    const totals = totalValueResult[0] || {
      totalPrincipal: 0,
      totalInterest: 0,
      totalPaid: 0,
    };

    return {
      requests: {
        total: totalRequests,
        pending: pendingRequests,
        funded: fundedRequests,
      },
      loans: {
        total: totalLoans,
        active: activeLoans,
        repaid: repaidLoans,
        overdue: overdueLoans,
        defaulted: defaultedLoans,
      },
      values: {
        totalDisbursed: totals.totalPrincipal,
        totalInterest: totals.totalInterest,
        totalRepaid: totals.totalPaid,
      },
      repaymentRate:
        totalLoans > 0
          ? Math.round((repaidLoans / totalLoans) * 100 * 10) / 10
          : 0,
      defaultRate:
        totalLoans > 0
          ? Math.round((defaultedLoans / totalLoans) * 100 * 10) / 10
          : 0,
    };
  }

  /**
   * Xác thực luồng người dùng: KYC -> Bank Connection -> Loan Action
   * Dùng chung cho cả Borrower và Lender
   */
  private async validateUserFlow(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    // 1. Kiểm tra KYC
    if (user.kycStatus !== KYC_STATUS_ENUM.VERIFIED) {
      throw new BadRequestException(
        'Tài khoản chưa được xác thực danh tính (KYC). Vui lòng hoàn thành KYC trước khi thực hiện bước này.',
      );
    }

    // 2. Kiểm tra liên kết ngân hàng (MongoDB trước, fallback mock)
    let hasBankConnection = false;

    // 2a. Kiểm tra trong MongoDB (persistent)
    try {
      const bankConnections =
        await this.openBankingService.getUserConnections(userId);
      if (bankConnections && bankConnections.length > 0) {
        hasBankConnection = true;
      }
    } catch (error) {
      this.logger.warn(
        `Lỗi kiểm tra bank connections trong MongoDB: ${error.message}`,
      );
    }

    // 2b. Fallback: kiểm tra trong mock data (RAM)
    if (!hasBankConnection) {
      try {
        const mockAccounts =
          await this.mockOpenBankingService.getAccounts('demo_user');
        if (mockAccounts && mockAccounts.length > 0) {
          hasBankConnection = true;
          // Tự động persist vào MongoDB cho lần sau
          for (const acc of mockAccounts) {
            try {
              await this.openBankingService.createConnection(
                userId,
                acc.bankId,
                acc.accountNumber,
                acc.accountName,
              );
            } catch (e) {
              // Bỏ qua nếu đã tồn tại
            }
          }
          this.logger.log(
            `Auto-persisted ${mockAccounts.length} mock account(s) to MongoDB for user ${userId}`,
          );
        }
      } catch (error) {
        this.logger.warn(`Lỗi kiểm tra mock accounts: ${error.message}`);
      }
    }

    if (!hasBankConnection) {
      throw new BadRequestException(
        'Tài khoản chưa liên kết ngân hàng. Vui lòng liên kết ngân hàng qua Open Banking để duy trì luồng giao dịch.',
      );
    }

    return user;
  }

  /**
   * Tự động kiểm tra và đánh dấu các yêu cầu vay đã quá hạn.
   * Cập nhật trạng thái PENDING -> EXPIRED
   */
  async checkExpiredRequests(): Promise<number> {
    let expiredCount = 0;
    try {
      const now = new Date();
      const expiredRequests = await this.loanRequestModel.find({
        status: LOAN_REQUEST_STATUS_ENUM.PENDING,
        expiresAt: { $lt: now },
      });

      for (const req of expiredRequests) {
        req.status = LOAN_REQUEST_STATUS_ENUM.EXPIRED;
        await req.save();
        expiredCount++;
        this.logger.log(`🔴 LoanRequest ${req._id} đã hết hạn (EXPIRED).`);
      }

      if (expiredCount > 0) {
        this.logger.log(
          `Đã tự động cancel ${expiredCount} LoanRequests do hết hạn.`,
        );
      }
    } catch (error) {
      this.logger.error(`checkExpiredRequests error: ${error.message}`);
    }
    return expiredCount;
  }

  /**
   * [TEST ONLY] Đặt dueDate và status của một loan để simulate các giai đoạn.
   * daysOffset < 0 → dueDate trong quá khứ (simulate quá hạn).
   */
  async setLoanDueForTest(loanId: string, daysOffset: number, status?: string) {
    const loan = await this.loanModel.findById(loanId);
    if (!loan) throw new NotFoundException(`Loan ${loanId} không tồn tại`);

    const now = new Date();
    const newDueDate = new Date(now.getTime() + daysOffset * 24 * 3600 * 1000);

    const update: any = { dueDate: newDueDate };
    if (
      status &&
      Object.values(LOAN_STATUS_ENUM).includes(status as LOAN_STATUS_ENUM)
    ) {
      update.status = status;
    }

    await this.loanModel.updateOne({ _id: loan._id }, { $set: update });

    this.logger.warn(
      `[TEST] Loan ${loanId} → dueDate=${newDueDate.toISOString()}, ` +
        `status=${status || '(unchanged)'}`,
    );

    return {
      loanId,
      newDueDate,
      status: status || loan.status,
      daysOffset,
    };
  }
}
