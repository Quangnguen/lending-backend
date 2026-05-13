import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreditScore, CreditScoreDocument } from '@database/schemas/credit-score.model';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { OpenBankingService } from '../openbanking/openbanking.service';
import { FinancialAnalyzerService } from '../openbanking/financial-analyzer.service';
import { OBFinancialSummary } from '../openbanking/providers/openbanking-provider.interface';
import { OraclePublisherService } from '../blockchain/oracle-publisher.service';
import { LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

/**
 * CreditScoringEngine — Thuật toán chấm điểm tín dụng nâng cao
 * 
 * Khác biệt so với CreditService cũ:
 * 1. Dùng OBFinancialSummary (structured data) thay vì raw transactions
 * 2. Thêm yếu tố: DTI ratio, savings rate, income stability, existing debt
 * 3. Có cơ chế PENALTY khi user default/overdue → giảm score
 * 4. Dynamic collateral ratio: score cao → cần ít thế chấp hơn
 * 5. Lưu lịch sử score để theo dõi trend
 * 
 * Bảng điểm (max 1000):
 * - Thu nhập & Ổn định:     250 điểm
 * - Chi tiêu & Tiết kiệm:  200 điểm
 * - Số dư & Tài sản:        200 điểm
 * - Hành vi giao dịch:      100 điểm
 * - Lịch sử NH liên kết:    100 điểm
 * - Lịch sử vay (platform): 150 điểm
 * 
 * Penalty:
 * - Mỗi lần OVERDUE:    -50 điểm
 * - Mỗi lần DEFAULTED:  -150 điểm
 * - Mỗi lần LIQUIDATED: -200 điểm
 * - DTI > 50%:           -30 → -100 điểm
 */
@Injectable()
export class CreditScoringEngine {
    private readonly logger = new Logger(CreditScoringEngine.name);

    constructor(
        @InjectModel(CreditScore.name)
        private creditScoreModel: Model<CreditScoreDocument>,
        @InjectModel(Loan.name)
        private loanModel: Model<LoanDocument>,
        private openBankingService: OpenBankingService,
        private financialAnalyzer: FinancialAnalyzerService,
        @Optional() private oraclePublisher?: OraclePublisherService,
    ) {}

    /**
     * Tính Credit Score đầy đủ cho user
     * 
     * Flow:
     * 1. Thu thập Financial Summary từ Open Banking
     * 2. Tính điểm từng thành phần
     * 3. Áp dụng penalties từ lịch sử vay
     * 4. Xác định rating + collateral ratio + loan limit
     * 5. Lưu vào DB
     */
    async calculateScore(userId: string, consentId?: string): Promise<CreditScore> {
        this.logger.log(`[CreditEngine] Calculating score for user ${userId}`);

        // 1. Lấy Financial Summary
        const financials = await this.financialAnalyzer.analyzeUserFinancials(userId, consentId);

        // 2. Lấy lịch sử vay trên platform
        const loanHistory = await this.getLoanHistory(userId);

        // 3. Kiểm tra bank connections
        const bankConnections = await this.openBankingService.getUserConnections(userId);
        const linkedBanks = bankConnections?.length || 0;

        // 4. Tính điểm từng thành phần
        const incomeScore = this.scoreIncome(financials);                    // Max 250
        const expenseScore = this.scoreExpenses(financials);                 // Max 200
        const balanceScore = this.scoreBalance(financials);                  // Max 200
        const behaviorScore = this.scoreBehavior(financials);                // Max 100
        const connectionScore = this.scoreConnections(linkedBanks, financials); // Max 100
        const platformScore = this.scorePlatformHistory(loanHistory);        // Max 150

        // 5. Tính penalty
        const penalty = this.calculatePenalty(loanHistory, financials);

        // 6. Tổng hợp
        const rawScore = incomeScore + expenseScore + balanceScore +
            behaviorScore + connectionScore + platformScore;
        const finalScore = Math.max(0, Math.min(1000, Math.round(rawScore - penalty.totalPenalty)));

        // 7. Rating & Collateral Ratio
        const { rating, collateralRatio, maxLoanMultiplier } = this.determineRating(finalScore);

        // 8. Tính loan limit
        const monthlyIncome = financials.income.monthlyAvgIncome;
        // Chuyển VND → USDT (tỷ giá demo ~25,000 VND/USDT)
        const monthlyIncomeUSDT = monthlyIncome / 25000;
        const baseLimitUSDT = monthlyIncomeUSDT * maxLoanMultiplier;
        // Bonus 20% nếu có nhiều NH liên kết
        const connectionMultiplier = linkedBanks >= 2 ? 1.2 : (linkedBanks >= 1 ? 1.1 : 1.0);
        const loanLimit = Math.round(baseLimitUSDT * connectionMultiplier);

        // 9. Lưu vào DB (trả về plain object để controller không cần .toObject())
        const creditScoreDoc = await this.creditScoreModel.create({
            userId: new Types.ObjectId(userId),
            score: finalScore,
            breakdown: {
                incomeScore,
                spendingScore: expenseScore,
                balanceScore,
                consistencyScore: behaviorScore,
                historyScore: connectionScore + platformScore,
            },
            rating,
            loanLimit,
            calculatedAt: new Date(),
        });

        this.logger.log(
            `[CreditEngine] User ${userId}: Score=${finalScore}/1000 (${rating}) | ` +
            `Penalty=${penalty.totalPenalty} | CollateralRatio=${collateralRatio}% | ` +
            `LoanLimit=${loanLimit} USDT | Banks=${linkedBanks} | ` +
            `DataSource=${financials.dataSource}`
        );

        // 10. Đẩy score lên Blockchain qua Oracle (async, không block response)
        this.publishScoreToBlockchain(userId, finalScore).catch(err =>
            this.logger.warn(`[CreditEngine] Oracle publish failed (non-blocking): ${err.message}`)
        );

        return creditScoreDoc.toObject();
    }

    /**
     * Xác định collateral ratio dựa trên credit score
     * → Đây là CORE CONCEPT: score cao = thế chấp ít hơn
     */
    getRequiredCollateralRatio(score: number): number {
        if (score >= 800) return 50;    // EXCELLENT: 50% (under-collateralized)
        if (score >= 700) return 80;    // GOOD+: 80%
        if (score >= 600) return 100;   // GOOD: 100%
        if (score >= 500) return 120;   // FAIR: 120%
        if (score >= 400) return 135;   // FAIR-: 135%
        return 150;                     // POOR: 150% (full collateral, giống DeFi)
    }

    /**
     * Giảm credit score khi user vi phạm (default, overdue)
     * Gọi từ Loan Service khi trạng thái loan thay đổi
     */
    async applyPenalty(
        userId: string,
        reason: 'OVERDUE' | 'DEFAULTED' | 'LIQUIDATED',
        loanId?: string,
    ): Promise<CreditScore | null> {
        const latestScore = await this.getLatestScore(userId);
        if (!latestScore) {
            this.logger.warn(`No credit score found for user ${userId} to apply penalty`);
            return null;
        }

        const penaltyPoints: Record<string, number> = {
            OVERDUE: 50,
            DEFAULTED: 150,
            LIQUIDATED: 200,
        };

        const penalty = penaltyPoints[reason] || 0;
        const newScore = Math.max(0, latestScore.score - penalty);
        const { rating, collateralRatio, maxLoanMultiplier } = this.determineRating(newScore);

        // Tạo record mới (không update record cũ để giữ history)
        const penalizedScore = await this.creditScoreModel.create({
            userId: new Types.ObjectId(userId),
            score: newScore,
            breakdown: latestScore.breakdown,
            rating,
            loanLimit: Math.round(latestScore.loanLimit * (newScore / Math.max(latestScore.score, 1))),
            calculatedAt: new Date(),
        });

        this.logger.warn(
            `[CreditEngine] PENALTY applied: User ${userId} | ` +
            `Reason=${reason} | ${latestScore.score} → ${newScore} | ` +
            `Loan=${loanId || 'N/A'}`
        );

        return penalizedScore;
    }

    async getLatestScore(userId: string): Promise<CreditScore | null> {
        return this.creditScoreModel.findOne({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * [Admin] Lấy điểm mới nhất của TẤT CẢ user bằng 1 aggregate query
     * Trả về: { userId → { score, rating, loanLimit, calculatedAt } }
     */
    async getLatestScoresForAllUsers(): Promise<Record<string, any>> {
        const latest = await this.creditScoreModel.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$userId',
                    score: { $first: '$score' },
                    rating: { $first: '$rating' },
                    loanLimit: { $first: '$loanLimit' },
                    calculatedAt: { $first: '$calculatedAt' },
                }
            }
        ]);

        // Map thành { "userId": scoreData }
        const result: Record<string, any> = {};
        for (const item of latest) {
            result[item._id.toString()] = {
                score: item.score,
                rating: item.rating,
                loanLimit: item.loanLimit,
                calculatedAt: item.calculatedAt,
            };
        }
        return result;
    }

    async getScoreHistory(userId: string, limit = 10): Promise<CreditScore[]> {
        return this.creditScoreModel.find({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }


    // ==========================================
    // BLOCKCHAIN ORACLE PUBLISHING
    // ==========================================

    /**
     * Đẩy credit score lên CreditScoreOracle contract trên blockchain
     * Chạy async, không block API response
     */
    private async publishScoreToBlockchain(userId: string, score: number): Promise<void> {
        if (!this.oraclePublisher || !this.oraclePublisher.isReady()) {
            return; // Oracle chưa configured, skip silently
        }

        // Cần lấy wallet address của user
        // TODO: Trong production, lấy từ User model (user.walletAddress)
        // Tạm thời log warning nếu không có wallet
        try {
            // Import lazy để tránh circular dependency
            const userModel = this.creditScoreModel.db.model('User');
            const user = await userModel.findById(userId).select('walletAddress').lean();

            if (!user || !(user as any).walletAddress) {
                this.logger.debug(`[CreditEngine] User ${userId} has no walletAddress - skip oracle publish`);
                return;
            }

            const txHash = await this.oraclePublisher.publishScore(
                (user as any).walletAddress,
                score,
            );

            if (txHash) {
                this.logger.log(`[CreditEngine] ✅ Score ${score} published to Oracle for user ${userId} | Tx: ${txHash}`);
            }
        } catch (error) {
            this.logger.warn(`[CreditEngine] Oracle publish error: ${error.message}`);
        }
    }

    // ==========================================
    // SCORING COMPONENTS
    // ==========================================

    /** Thu nhập & Ổn định — Max 250 */
    private scoreIncome(f: OBFinancialSummary): number {
        let score = 0;
        const monthly = f.income.monthlyAvgIncome;

        // Thu nhập trung bình/tháng (VND)
        if (monthly >= 50_000_000) score += 120;       // 50tr+
        else if (monthly >= 30_000_000) score += 100;  // 30-50tr
        else if (monthly >= 15_000_000) score += 80;   // 15-30tr
        else if (monthly >= 8_000_000) score += 50;    // 8-15tr
        else score += Math.round((monthly / 8_000_000) * 30);

        // Thu nhập từ lương (ổn định hơn freelance)
        const salaryRatio = f.income.totalIncome > 0
            ? f.income.salaryIncome / f.income.totalIncome
            : 0;
        score += Math.round(salaryRatio * 60); // Max 60 nếu 100% từ lương

        // Ổn định thu nhập
        score += Math.round(f.income.incomeStability * 70); // Max 70

        return Math.min(score, 250);
    }

    /** Chi tiêu & Tiết kiệm — Max 200 */
    private scoreExpenses(f: OBFinancialSummary): number {
        let score = 0;

        // Tỷ lệ tiết kiệm (savings rate)
        const savingsRate = f.expenses.savingsRate;
        if (savingsRate >= 0.4) score += 100;       // Tiết kiệm 40%+
        else if (savingsRate >= 0.25) score += 80;
        else if (savingsRate >= 0.1) score += 50;
        else if (savingsRate >= 0) score += 20;
        else score += 0; // Chi vượt thu

        // Tỷ lệ chi tiêu thiết yếu / tổng chi (thấp = chi tiêu hợp lý)
        const essentialRatio = f.expenses.totalExpenses > 0
            ? f.expenses.essentialExpenses / f.expenses.totalExpenses
            : 0;
        if (essentialRatio >= 0.5) score += 60;  // Chi thiết yếu >= 50%
        else if (essentialRatio >= 0.3) score += 40;
        else score += 20;

        // DTI penalty
        const dti = f.existingDebt.debtToIncomeRatio;
        if (dti === 0) score += 40;          // Không nợ
        else if (dti < 0.3) score += 30;     // DTI < 30%
        else if (dti < 0.5) score += 10;     // DTI 30-50%
        else score -= 20;                    // DTI > 50% (penalty)

        return Math.max(0, Math.min(score, 200));
    }

    /** Số dư & Tài sản — Max 200 */
    private scoreBalance(f: OBFinancialSummary): number {
        let score = 0;
        const balance = f.balance.currentBalance;

        // Số dư hiện tại (VND)
        if (balance >= 200_000_000) score += 80;       // 200tr+
        else if (balance >= 100_000_000) score += 60;  // 100-200tr
        else if (balance >= 50_000_000) score += 45;   // 50-100tr
        else if (balance >= 20_000_000) score += 30;   // 20-50tr
        else score += Math.round((balance / 20_000_000) * 20);

        // Có tài khoản tiết kiệm
        if (f.balance.hasSavingsAccount) score += 40;

        // Số dư tối thiểu (không bao giờ rơi xuống quá thấp)
        const minBalanceRatio = f.balance.avgBalance > 0
            ? f.balance.minBalance / f.balance.avgBalance
            : 0;
        if (minBalanceRatio >= 0.5) score += 40;     // Min balance >= 50% avg
        else if (minBalanceRatio >= 0.3) score += 25;
        else score += 10;

        // Số lượng tài khoản
        score += Math.min(f.balance.totalAccounts * 15, 40);

        return Math.min(score, 200);
    }

    /** Hành vi giao dịch — Max 100 */
    private scoreBehavior(f: OBFinancialSummary): number {
        let score = 0;

        // Tần suất giao dịch (active user)
        const monthlyTx = f.behavior.avgTransactionsPerMonth;
        if (monthlyTx >= 30) score += 40;
        else if (monthlyTx >= 15) score += 30;
        else if (monthlyTx >= 5) score += 15;
        else score += 5;

        // Thanh toán đều đặn (auto-pay bills)
        score += Math.min(f.behavior.regularPayments * 8, 30);

        // Không thấu chi
        if (f.behavior.overdraftCount === 0) score += 20;
        else score -= f.behavior.overdraftCount * 5;

        // Không bounce
        if (f.behavior.bounceCount === 0) score += 10;
        else score -= f.behavior.bounceCount * 10;

        return Math.max(0, Math.min(score, 100));
    }

    /** Lịch sử liên kết NH — Max 100 */
    private scoreConnections(linkedBanks: number, f: OBFinancialSummary): number {
        let score = 0;

        // Số NH liên kết
        if (linkedBanks >= 3) score += 50;
        else if (linkedBanks >= 2) score += 35;
        else if (linkedBanks >= 1) score += 20;
        else score += 0;

        // Chất lượng dữ liệu
        if (f.dataQuality === 'HIGH') score += 30;
        else if (f.dataQuality === 'MEDIUM') score += 20;
        else score += 5;

        // Nguồn dữ liệu
        if (f.dataSource === 'REAL_API') score += 20;
        else if (f.dataSource === 'HYBRID') score += 10;
        else score += 0;

        return Math.min(score, 100);
    }

    /** Lịch sử vay trên platform — Max 150 */
    private scorePlatformHistory(history: LoanHistoryStats): number {
        if (history.totalLoans === 0) return 30; // New user baseline

        let score = 30;

        // Khoản vay thành công
        score += Math.min(history.repaidLoans * 25, 80);

        // Tỷ lệ trả đúng hạn
        if (history.totalLoans > 0) {
            const onTimeRate = history.repaidLoans / history.totalLoans;
            score += Math.round(onTimeRate * 40);
        }

        return Math.min(score, 150);
    }

    // ==========================================
    // PENALTY CALCULATION
    // ==========================================

    private calculatePenalty(
        history: LoanHistoryStats,
        financials: OBFinancialSummary,
    ): { totalPenalty: number; reasons: string[] } {
        let totalPenalty = 0;
        const reasons: string[] = [];

        // Platform penalties
        if (history.overdueLoans > 0) {
            const p = history.overdueLoans * 50;
            totalPenalty += p;
            reasons.push(`OVERDUE x${history.overdueLoans}: -${p}`);
        }
        if (history.defaultedLoans > 0) {
            const p = history.defaultedLoans * 150;
            totalPenalty += p;
            reasons.push(`DEFAULTED x${history.defaultedLoans}: -${p}`);
        }
        if (history.liquidatedLoans > 0) {
            const p = history.liquidatedLoans * 200;
            totalPenalty += p;
            reasons.push(`LIQUIDATED x${history.liquidatedLoans}: -${p}`);
        }

        // DTI penalty
        const dti = financials.existingDebt.debtToIncomeRatio;
        if (dti > 0.7) {
            totalPenalty += 100;
            reasons.push(`HIGH_DTI (${(dti * 100).toFixed(0)}%): -100`);
        } else if (dti > 0.5) {
            totalPenalty += 30;
            reasons.push(`MODERATE_DTI (${(dti * 100).toFixed(0)}%): -30`);
        }

        return { totalPenalty, reasons };
    }

    // ==========================================
    // HELPERS
    // ==========================================

    private async getLoanHistory(userId: string): Promise<LoanHistoryStats> {
        const loans = await this.loanModel.find({
            borrowerId: new Types.ObjectId(userId),
        }).lean();

        return {
            totalLoans: loans.length,
            activeLoans: loans.filter(l => l.status === LOAN_STATUS_ENUM.ACTIVE).length,
            repaidLoans: loans.filter(l => l.status === LOAN_STATUS_ENUM.REPAID).length,
            overdueLoans: loans.filter(l => l.status === LOAN_STATUS_ENUM.OVERDUE).length,
            defaultedLoans: loans.filter(l => l.status === LOAN_STATUS_ENUM.DEFAULTED).length,
            liquidatedLoans: loans.filter(l => l.status === LOAN_STATUS_ENUM.LIQUIDATED).length,
        };
    }

    private determineRating(score: number): {
        rating: string;
        collateralRatio: number;
        maxLoanMultiplier: number;
    } {
        if (score >= 800) return { rating: 'EXCELLENT', collateralRatio: 50, maxLoanMultiplier: 5 };
        if (score >= 700) return { rating: 'VERY_GOOD', collateralRatio: 80, maxLoanMultiplier: 4 };
        if (score >= 600) return { rating: 'GOOD', collateralRatio: 100, maxLoanMultiplier: 3 };
        if (score >= 500) return { rating: 'FAIR', collateralRatio: 120, maxLoanMultiplier: 2 };
        if (score >= 400) return { rating: 'BELOW_FAIR', collateralRatio: 135, maxLoanMultiplier: 1.5 };
        return { rating: 'POOR', collateralRatio: 150, maxLoanMultiplier: 1 };
    }


}

interface LoanHistoryStats {
    totalLoans: number;
    activeLoans: number;
    repaidLoans: number;
    overdueLoans: number;
    defaultedLoans: number;
    liquidatedLoans: number;
}
