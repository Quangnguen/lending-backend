import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { User, UserDocument } from '@database/schemas/user.model';
import { CreditScoringEngine } from '../credit/credit-scoring.engine';
import { OraclePublisherService } from '../blockchain/oracle-publisher.service';
import { LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

/**
 * LiquidationService — Quản lý thanh lý nợ xấu & mint DebtToken
 *
 * Chức năng:
 * 1. Cron job: Quét khoản vay quá hạn → đánh dấu OVERDUE / DEFAULTED
 * 2. Trigger liquidation on-chain khi quá hạn > threshold
 * 3. Mint DebtToken (ERC-721) ghi nhận nợ xấu on-chain
 * 4. Áp dụng credit score penalty tự động
 *
 * Threshold:
 * - Overdue: > dueDate (phạt -50 điểm)
 * - Defaulted: > dueDate + 30 ngày (phạt -150 điểm + mint DebtToken)
 * - Liquidated: > dueDate + 60 ngày (phạt -200 điểm + liquidate collateral)
 */

// ABI tối giản cho DebtToken
const DebtTokenABI = [
    'function mintDebtToken(address borrower, uint256 loanId, address lender, uint256 principalAmount, uint256 debtAmount, string reason, address loanContract) external returns (uint256)',
    'function getDebtCount(address borrower) external view returns (uint256)',
    'function hasDebt(address borrower) external view returns (bool)',
    'function getTotalDebt(address borrower) external view returns (uint256)',
    'function getBorrowerDebtTokens(address borrower) external view returns (uint256[])',
    'event DebtTokenMinted(uint256 indexed tokenId, address indexed borrower, uint256 indexed loanId, uint256 debtAmount, string reason)',
];

// ABI cho Loan contract liquidation
const LoanLiquidateABI = [
    'function liquidate() external',
    'function isOverdue() external view returns (bool)',
    'function getLoanDetails() external view returns (tuple(uint256 loanId, address borrower, address lender, address loanToken, address collateralToken, uint256 principal, uint256 interestRate, uint256 collateralAmount, uint256 duration, uint256 startTime, uint256 endTime, uint8 status))',
    'function getTotalRepaymentAmount() external view returns (uint256)',
];

@Injectable()
export class LiquidationService {
    private readonly logger = new Logger(LiquidationService.name);
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private debtTokenContract: ethers.Contract | null = null;
    private isConfigured = false;

    // Thresholds (days)
    private readonly OVERDUE_DAYS = 0;       // Ngay sau dueDate
    private readonly DEFAULT_DAYS = 30;      // 30 ngày sau dueDate
    private readonly LIQUIDATION_DAYS = 60;  // 60 ngày sau dueDate

    constructor(
        @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private creditScoringEngine: CreditScoringEngine,
        private configService: ConfigService,
    ) {
        this.initBlockchain();
    }

    private async initBlockchain() {
        try {
            const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
            const privateKey = this.configService.get<string>('ORACLE_PRIVATE_KEY');
            const debtTokenAddress = this.configService.get<string>('DEBT_TOKEN_ADDRESS');

            if (!rpcUrl || !privateKey) {
                this.logger.warn('[Liquidation] Missing blockchain config - running in DB-only mode');
                return;
            }

            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.wallet = new ethers.Wallet(privateKey, this.provider);

            if (debtTokenAddress) {
                this.debtTokenContract = new ethers.Contract(
                    debtTokenAddress, DebtTokenABI, this.wallet,
                );
                this.isConfigured = true;
                this.logger.log(`[Liquidation] ✅ Configured | DebtToken: ${debtTokenAddress}`);
            } else {
                this.logger.warn('[Liquidation] No DEBT_TOKEN_ADDRESS - DebtToken minting disabled');
            }
        } catch (error) {
            this.logger.error(`[Liquidation] Init failed: ${error.message}`);
        }
    }

    // ==========================================
    // CRON JOB: Quét khoản vay quá hạn
    // ==========================================

    /**
     * Chạy mỗi giờ: Quét tất cả khoản vay ACTIVE → detect OVERDUE / DEFAULTED
     */
    @Cron(CronExpression.EVERY_HOUR)
    async scanOverdueLoans() {
        this.logger.log('[Liquidation] 🔍 Scanning for overdue loans...');

        const now = new Date();

        // 1. Tìm loans ACTIVE đã quá hạn
        const overdueLoans = await this.loanModel.find({
            status: LOAN_STATUS_ENUM.ACTIVE,
            dueDate: { $lt: now },
        }).lean();

        // 2. Tìm loans OVERDUE cần upgrade thành DEFAULTED
        const longOverdueLoans = await this.loanModel.find({
            status: LOAN_STATUS_ENUM.OVERDUE,
            dueDate: { $lt: new Date(now.getTime() - this.DEFAULT_DAYS * 24 * 3600 * 1000) },
        }).lean();

        let processedOverdue = 0;
        let processedDefault = 0;

        // 3. Xử lý ACTIVE → OVERDUE
        for (const loan of overdueLoans) {
            await this.processOverdue(loan);
            processedOverdue++;
        }

        // 4. Xử lý OVERDUE → DEFAULTED
        for (const loan of longOverdueLoans) {
            await this.processDefault(loan);
            processedDefault++;
        }

        if (processedOverdue > 0 || processedDefault > 0) {
            this.logger.warn(
                `[Liquidation] Processed: ${processedOverdue} → OVERDUE, ${processedDefault} → DEFAULTED`
            );
        }
    }

    // ==========================================
    // PROCESSING
    // ==========================================

    /**
     * Xử lý ACTIVE → OVERDUE
     * - Cập nhật status trong DB
     * - Áp dụng penalty -50 điểm
     */
    private async processOverdue(loan: any) {
        try {
            // Atomic update: chỉ cập nhật nếu loan vẫn ACTIVE (tránh double-penalty khi 2 cron race)
            const result = await this.loanModel.updateOne(
                { _id: loan._id, status: LOAN_STATUS_ENUM.ACTIVE },
                { $set: { status: LOAN_STATUS_ENUM.OVERDUE } },
            );

            if (result.modifiedCount === 0) return; // Đã xử lý bởi cron khác, bỏ qua

            // Penalty
            const borrowerId = loan.borrowerId.toString();
            await this.creditScoringEngine.applyPenalty(
                borrowerId, 'OVERDUE', loan._id.toString(),
            );

            this.logger.warn(
                `[Liquidation] ⚠️ Loan ${loan._id} → OVERDUE | ` +
                `Borrower: ${borrowerId} | Due: ${loan.dueDate}`
            );
        } catch (error) {
            this.logger.error(`[Liquidation] Error processing overdue ${loan._id}: ${error.message}`);
        }
    }

    /**
     * Xử lý OVERDUE → DEFAULTED
     * - Cập nhật status
     * - Penalty -150 điểm
     * - Mint DebtToken on-chain
     * - Trigger liquidation on-chain (nếu có collateral)
     */
    private async processDefault(loan: any) {
        try {
            await this.loanModel.updateOne(
                { _id: loan._id },
                { $set: { status: LOAN_STATUS_ENUM.DEFAULTED } },
            );

            const borrowerId = loan.borrowerId.toString();

            // Penalty
            await this.creditScoringEngine.applyPenalty(
                borrowerId, 'DEFAULTED', loan._id.toString(),
            );

            // Mint DebtToken on-chain
            await this.mintDebtTokenOnChain(loan);

            // Trigger on-chain liquidation
            await this.triggerOnChainLiquidation(loan);

            this.logger.error(
                `[Liquidation] 🔴 Loan ${loan._id} → DEFAULTED | ` +
                `Borrower: ${borrowerId} | Principal: ${loan.principalAmount} USDT`
            );
        } catch (error) {
            this.logger.error(`[Liquidation] Error processing default ${loan._id}: ${error.message}`);
        }
    }

    // ==========================================
    // DEBT TOKEN MINTING
    // ==========================================

    /**
     * Mint DebtToken (ERC-721) trên blockchain
     * Ghi nhận vĩnh viễn nợ xấu — Soulbound, không thể transfer
     */
    async mintDebtTokenOnChain(loan: any): Promise<string | null> {
        if (!this.isConfigured || !this.debtTokenContract) {
            this.logger.debug('[Liquidation] DebtToken not configured - skip mint');
            return null;
        }

        try {
            // Lấy wallet address của borrower
            const borrower = await this.userModel.findById(loan.borrowerId)
                .select('walletAddress').lean();

            if (!borrower || !(borrower as any).walletAddress) {
                this.logger.warn(`[Liquidation] Borrower ${loan.borrowerId} has no walletAddress`);
                return null;
            }

            const walletAddress = (borrower as any).walletAddress;
            const lender = await this.userModel.findById(loan.lenderId)
                .select('walletAddress').lean();
            const lenderWallet = (lender as any)?.walletAddress || ethers.ZeroAddress;

            // Debt amount = tổng nợ chưa trả
            const debtAmount = ethers.parseUnits(
                String(loan.remainingAmount || loan.totalAmount),
                6, // USDT decimals
            );
            const principalAmount = ethers.parseUnits(
                String(loan.principalAmount), 6,
            );

            this.logger.log(`[Liquidation] Minting DebtToken for ${walletAddress}...`);

            const tx = await this.debtTokenContract.mintDebtToken(
                walletAddress,
                loan._id.toString().slice(-8), // loanId (truncated for uint256)
                lenderWallet,
                principalAmount,
                debtAmount,
                'DEFAULTED',
                loan.loanContractAddress || ethers.ZeroAddress,
            );

            const receipt = await tx.wait();

            this.logger.log(
                `[Liquidation] 🏷️ DebtToken minted! Tx: ${receipt.hash} | ` +
                `Borrower: ${walletAddress} | Debt: ${loan.remainingAmount || loan.totalAmount} USDT`
            );

            return receipt.hash;
        } catch (error) {
            this.logger.error(`[Liquidation] DebtToken mint failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Trigger liquidation trên Loan contract on-chain
     */
    private async triggerOnChainLiquidation(loan: any): Promise<string | null> {
        if (!this.provider || !this.wallet || !loan.loanContractAddress) {
            return null;
        }

        try {
            const loanContract = new ethers.Contract(
                loan.loanContractAddress,
                LoanLiquidateABI,
                this.wallet,
            );

            // Check if overdue on-chain
            const isOverdue = await loanContract.isOverdue();
            if (!isOverdue) {
                this.logger.debug(`[Liquidation] Loan ${loan.loanContractAddress} not overdue on-chain yet`);
                return null;
            }

            const tx = await loanContract.liquidate();
            const receipt = await tx.wait();

            // Cập nhật DB
            await this.loanModel.updateOne(
                { _id: loan._id },
                { $set: { status: LOAN_STATUS_ENUM.LIQUIDATED } },
            );

            // Penalty LIQUIDATED (-200)
            await this.creditScoringEngine.applyPenalty(
                loan.borrowerId.toString(), 'LIQUIDATED', loan._id.toString(),
            );

            this.logger.error(
                `[Liquidation] ⛓️ On-chain liquidation! Tx: ${receipt.hash} | Loan: ${loan.loanContractAddress}`
            );

            return receipt.hash;
        } catch (error) {
            this.logger.error(`[Liquidation] On-chain liquidation failed: ${error.message}`);
            return null;
        }
    }

    // ==========================================
    // VIEW METHODS (cho API)
    // ==========================================

    /**
     * Lấy danh sách khoản vay quá hạn (cho admin dashboard)
     */
    async getOverdueReport() {
        const [overdue, defaulted, liquidated] = await Promise.all([
            this.loanModel.find({ status: LOAN_STATUS_ENUM.OVERDUE })
                .populate('borrowerId', 'fullName email walletAddress')
                .populate('lenderId', 'fullName email walletAddress')
                .sort({ dueDate: 1 }).lean(),
            this.loanModel.find({ status: LOAN_STATUS_ENUM.DEFAULTED })
                .populate('borrowerId', 'fullName email walletAddress')
                .populate('lenderId', 'fullName email walletAddress')
                .sort({ dueDate: 1 }).lean(),
            this.loanModel.find({ status: LOAN_STATUS_ENUM.LIQUIDATED })
                .populate('borrowerId', 'fullName email walletAddress')
                .populate('lenderId', 'fullName email walletAddress')
                .sort({ dueDate: 1 }).lean(),
        ]);

        const now = new Date();

        return {
            overdue: overdue.map(l => ({
                ...l,
                daysOverdue: Math.ceil((now.getTime() - l.dueDate.getTime()) / (24 * 3600 * 1000)),
                daysUntilDefault: Math.max(0, this.DEFAULT_DAYS - Math.ceil((now.getTime() - l.dueDate.getTime()) / (24 * 3600 * 1000))),
            })),
            defaulted,
            liquidated,
            summary: {
                overdueCount: overdue.length,
                defaultedCount: defaulted.length,
                liquidatedCount: liquidated.length,
                totalAtRisk: overdue.reduce((s, l) => s + (l.remainingAmount || l.totalAmount), 0),
                totalDefaulted: defaulted.reduce((s, l) => s + (l.remainingAmount || l.totalAmount), 0),
            },
        };
    }

    /**
     * Kiểm tra DebtToken on-chain của borrower
     */
    async checkBorrowerDebtTokens(walletAddress: string) {
        if (!this.isConfigured || !this.debtTokenContract) {
            return { configured: false, message: 'DebtToken contract not configured' };
        }

        try {
            const hasDebt = await this.debtTokenContract.hasDebt(walletAddress);
            const debtCount = await this.debtTokenContract.getDebtCount(walletAddress);
            const totalDebt = await this.debtTokenContract.getTotalDebt(walletAddress);

            return {
                configured: true,
                walletAddress,
                hasDebt,
                debtTokenCount: Number(debtCount),
                totalDebtAmount: ethers.formatUnits(totalDebt, 6) + ' USDT',
            };
        } catch (error) {
            this.logger.error(`[Liquidation] Check debt failed: ${error.message}`);
            return { configured: true, error: error.message };
        }
    }

    /**
     * Tạo lịch trả nợ theo kỳ (installments) cho khoản vay
     */
    generateRepaymentSchedule(
        principalAmount: number,
        interestRate: number,
        durationDays: number,
        startDate: Date,
        installments: number = 0, // 0 = tự tính (monthly)
    ) {
        // Nếu không chỉ định, tính theo tháng
        if (installments <= 0) {
            installments = Math.max(1, Math.ceil(durationDays / 30));
        }

        const totalInterest = (principalAmount * interestRate * durationDays) / (365 * 100);
        const totalAmount = principalAmount + totalInterest;
        const installmentAmount = Math.round((totalAmount / installments) * 100) / 100;
        const principalPerInstallment = Math.round((principalAmount / installments) * 100) / 100;
        const interestPerInstallment = Math.round((totalInterest / installments) * 100) / 100;

        const schedule = [];
        let remainingPrincipal = principalAmount;

        for (let i = 1; i <= installments; i++) {
            const dueDate = new Date(startDate.getTime() + (durationDays / installments) * i * 24 * 3600 * 1000);
            const isLast = i === installments;

            // Kỳ cuối: trả hết phần dư
            const thisPrincipal = isLast
                ? Math.round(remainingPrincipal * 100) / 100
                : principalPerInstallment;
            const thisInterest = isLast
                ? Math.round((totalInterest - interestPerInstallment * (installments - 1)) * 100) / 100
                : interestPerInstallment;

            remainingPrincipal -= thisPrincipal;

            schedule.push({
                installmentNumber: i,
                dueDate,
                principalAmount: thisPrincipal,
                interestAmount: thisInterest,
                totalAmount: Math.round((thisPrincipal + thisInterest) * 100) / 100,
                remainingPrincipal: Math.max(0, Math.round(remainingPrincipal * 100) / 100),
                status: 'PENDING' as 'PENDING' | 'PAID' | 'OVERDUE',
            });
        }

        return {
            loanSummary: {
                principalAmount,
                interestRate,
                totalInterest: Math.round(totalInterest * 100) / 100,
                totalAmount: Math.round(totalAmount * 100) / 100,
                durationDays,
                installments,
            },
            schedule,
        };
    }
}
