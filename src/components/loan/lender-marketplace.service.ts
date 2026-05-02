import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanRequest, LoanRequestDocument } from '@database/schemas/bank-request.model';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { User, UserDocument } from '@database/schemas/user.model';
import { CreditScoringEngine } from '../credit/credit-scoring.engine';
import { CreditScore, CreditScoreDocument } from '@database/schemas/credit-score.model';
import { LOAN_REQUEST_STATUS_ENUM, LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

/**
 * LenderMarketplaceService — Nâng cao trải nghiệm Lender trên Marketplace
 *
 * Bước 3 cần:
 * 1. Hiển thị Credit Score & Risk Level cho mỗi loan request
 * 2. Phân tích rủi ro (risk assessment) cho lender ra quyết định
 * 3. Gợi ý loan requests phù hợp (matching recommendation)
 * 4. Portfolio analytics cho lender (diversification, exposure)
 *
 * Khác biệt vs getPendingRequests() cũ:
 * - Cũ: Chỉ trả về raw data + filter cơ bản
 * - Mới: Enriched data (credit score, risk level, expected return, default probability)
 */
@Injectable()
export class LenderMarketplaceService {
    private readonly logger = new Logger(LenderMarketplaceService.name);

    constructor(
        @InjectModel(LoanRequest.name) private loanRequestModel: Model<LoanRequestDocument>,
        @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(CreditScore.name) private creditScoreModel: Model<CreditScoreDocument>,
        private creditScoringEngine: CreditScoringEngine,
    ) {}

    /**
     * Marketplace nâng cao — Enrich loan requests với thông tin risk cho lender
     *
     * Mỗi loan request trả về thêm:
     * - borrowerRisk: Credit score, rating, collateral ratio
     * - expectedReturn: Lãi dự kiến
     * - riskMetrics: Default probability, risk level, recommendation
     */
    async getEnrichedMarketplace(
        lenderId: string,
        filters?: {
            minAmount?: number;
            maxAmount?: number;
            minRate?: number;
            maxRate?: number;
            purpose?: string;
            riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
            sortBy?: 'rate' | 'amount' | 'risk' | 'return';
            sortOrder?: 'asc' | 'desc';
        },
    ) {
        // 1. Query pending requests (exclude lender's own)
        const query: any = {
            status: LOAN_REQUEST_STATUS_ENUM.PENDING,
            borrowerId: { $ne: new Types.ObjectId(lenderId) }, // Không hiện request của chính mình
        };

        if (filters?.minAmount || filters?.maxAmount) {
            query.loanAmount = {};
            if (filters.minAmount) query.loanAmount.$gte = Number(filters.minAmount);
            if (filters.maxAmount) query.loanAmount.$lte = Number(filters.maxAmount);
        }
        if (filters?.minRate || filters?.maxRate) {
            query.interestRate = {};
            if (filters.minRate) query.interestRate.$gte = Number(filters.minRate);
            if (filters.maxRate) query.interestRate.$lte = Number(filters.maxRate);
        }
        if (filters?.purpose) {
            query.purpose = filters.purpose;
        }

        const requests = await this.loanRequestModel.find(query)
            .populate('borrowerId', 'fullName email avatarUrl walletAddress kycStatus createdAt')
            .sort({ createdAt: -1 })
            .lean();

        // 2. Enrich từng request với risk data
        const enrichedRequests = await Promise.all(
            requests.map(req => this.enrichLoanRequest(req)),
        );

        // 3. Filter theo risk level (nếu có)
        let filtered = enrichedRequests;
        if (filters?.riskLevel) {
            filtered = enrichedRequests.filter(r => r.riskMetrics.riskLevel === filters.riskLevel);
        }

        // 4. Sort
        filtered = this.sortRequests(filtered, filters?.sortBy, filters?.sortOrder);

        // 5. Lấy portfolio summary cho lender
        const portfolio = await this.getLenderPortfolioSummary(lenderId);

        return {
            requests: filtered,
            total: filtered.length,
            portfolio,
            riskDistribution: {
                low: enrichedRequests.filter(r => r.riskMetrics.riskLevel === 'LOW').length,
                medium: enrichedRequests.filter(r => r.riskMetrics.riskLevel === 'MEDIUM').length,
                high: enrichedRequests.filter(r => r.riskMetrics.riskLevel === 'HIGH').length,
            },
        };
    }

    /**
     * Chi tiết risk assessment cho 1 loan request
     * Lender xem trước khi quyết định fund
     */
    async getLoanRequestRiskAssessment(requestId: string) {
        const request = await this.loanRequestModel.findById(requestId)
            .populate('borrowerId', 'fullName email avatarUrl walletAddress kycStatus createdAt')
            .lean();

        if (!request) return null;

        const enriched = await this.enrichLoanRequest(request);
        const borrowerHistory = await this.getBorrowerLoanHistory(request.borrowerId._id?.toString() || request.borrowerId.toString());

        return {
            ...enriched,
            borrowerHistory,
            recommendation: this.generateRecommendation(enriched, borrowerHistory),
        };
    }

    /**
     * Gợi ý loan requests phù hợp cho lender
     * Dựa trên: risk tolerance, portfolio balance, past investment pattern
     */
    async getRecommendedLoans(lenderId: string, limit = 5) {
        // Lấy lịch sử đầu tư của lender để hiểu preference
        const pastInvestments = await this.loanModel.find({
            lenderId: new Types.ObjectId(lenderId),
        }).lean();

        // Tính average interest rate và amount từ past investments
        const avgRate = pastInvestments.length > 0
            ? pastInvestments.reduce((s, l) => s + l.interestRate, 0) / pastInvestments.length
            : 10; // Default 10%
        const avgAmount = pastInvestments.length > 0
            ? pastInvestments.reduce((s, l) => s + l.principalAmount, 0) / pastInvestments.length
            : 500; // Default 500 USDT

        // Lấy marketplace và score
        const marketplace = await this.getEnrichedMarketplace(lenderId);

        // Score mỗi request dựa trên match với preference
        const scored = marketplace.requests.map(req => {
            let matchScore = 0;

            // Interest rate gần với preference
            const rateDiff = Math.abs(req.loanAmount - avgAmount);
            matchScore += Math.max(0, 100 - rateDiff / 10);

            // Risk thấp → score cao hơn
            if (req.riskMetrics.riskLevel === 'LOW') matchScore += 50;
            else if (req.riskMetrics.riskLevel === 'MEDIUM') matchScore += 25;

            // Borrower có credit score cao
            if (req.borrowerRisk.creditScore >= 700) matchScore += 30;
            else if (req.borrowerRisk.creditScore >= 500) matchScore += 15;

            return { ...req, matchScore };
        });

        // Sort by match score và trả về top N
        scored.sort((a, b) => b.matchScore - a.matchScore);

        return {
            recommendations: scored.slice(0, limit),
            basedOn: {
                avgInvestmentRate: Math.round(avgRate * 10) / 10,
                avgInvestmentAmount: Math.round(avgAmount),
                totalPastInvestments: pastInvestments.length,
            },
        };
    }

    /**
     * Portfolio analytics cho lender
     */
    async getLenderPortfolioSummary(lenderId: string) {
        const investments = await this.loanModel.find({
            lenderId: new Types.ObjectId(lenderId),
        }).lean();

        if (investments.length === 0) {
            return {
                totalInvested: 0,
                activeInvestments: 0,
                totalReturn: 0,
                avgInterestRate: 0,
                defaultRate: 0,
                diversificationScore: 0,
            };
        }

        const active = investments.filter(l => l.status === LOAN_STATUS_ENUM.ACTIVE);
        const repaid = investments.filter(l => l.status === LOAN_STATUS_ENUM.REPAID);
        const defaulted = investments.filter(l =>
            l.status === LOAN_STATUS_ENUM.DEFAULTED || l.status === LOAN_STATUS_ENUM.LIQUIDATED
        );

        const totalInvested = investments.reduce((s, l) => s + l.principalAmount, 0);
        const totalReturn = repaid.reduce((s, l) => s + (l.amountPaid || 0) - l.principalAmount, 0);
        const avgRate = investments.reduce((s, l) => s + l.interestRate, 0) / investments.length;

        // Diversification: số borrowers khác nhau / tổng investments
        const uniqueBorrowers = new Set(investments.map(l => l.borrowerId.toString())).size;
        const diversificationScore = Math.min(100, Math.round((uniqueBorrowers / investments.length) * 100));

        return {
            totalInvested: Math.round(totalInvested * 100) / 100,
            activeInvestments: active.length,
            completedInvestments: repaid.length,
            totalReturn: Math.round(totalReturn * 100) / 100,
            avgInterestRate: Math.round(avgRate * 10) / 10,
            defaultRate: investments.length > 0
                ? Math.round((defaulted.length / investments.length) * 100 * 10) / 10
                : 0,
            diversificationScore,
            uniqueBorrowers,
        };
    }

    // ===== PRIVATE HELPERS =====

    /**
     * Enrich 1 loan request với thông tin credit score và risk metrics
     */
    private async enrichLoanRequest(request: any) {
        const borrowerId = request.borrowerId._id?.toString() || request.borrowerId.toString();

        // Lấy credit score
        const creditScore = await this.creditScoreModel.findOne({
            userId: new Types.ObjectId(borrowerId),
        }).sort({ createdAt: -1 }).lean();

        const score = creditScore?.score || 0;
        const rating = creditScore?.rating || 'UNRATED';
        const collateralRatio = this.creditScoringEngine.getRequiredCollateralRatio(score);

        // Tính expected return
        const interestAmount = (request.loanAmount * request.interestRate * (request.durationDays || 30)) / (365 * 100);
        const expectedReturn = Math.round(interestAmount * 100) / 100;

        // Tính risk metrics
        const riskMetrics = this.calculateRiskMetrics(score, request, collateralRatio);

        return {
            _id: request._id,
            borrowerId: request.borrowerId,
            loanAmount: request.loanAmount,
            interestRate: request.interestRate,
            durationDays: request.durationDays,
            purpose: request.purpose,
            purposeDescription: request.purposeDescription,
            collateralAmount: request.collateralAmount,
            status: request.status,
            createdAt: request.createdAt,
            expiresAt: request.expiresAt,

            // === ENRICHED DATA ===
            borrowerRisk: {
                creditScore: score,
                rating,
                collateralRatio,
                collateralRatioLabel: this.getCollateralLabel(collateralRatio),
                loanLimit: creditScore?.loanLimit || 0,
                hasValidScore: !!creditScore,
            },
            expectedReturn: {
                interestAmount: expectedReturn,
                annualizedRate: request.interestRate,
                netReturn: Math.round(expectedReturn * 0.99 * 100) / 100, // Sau 1% platform fee
            },
            riskMetrics,
        };
    }

    /**
     * Tính toán risk metrics cho loan request
     */
    private calculateRiskMetrics(
        creditScore: number,
        request: any,
        collateralRatio: number,
    ) {
        // Default probability dựa trên credit score
        let defaultProbability: number;
        if (creditScore >= 800) defaultProbability = 0.02;      // 2%
        else if (creditScore >= 700) defaultProbability = 0.05;  // 5%
        else if (creditScore >= 600) defaultProbability = 0.08;  // 8%
        else if (creditScore >= 500) defaultProbability = 0.15;  // 15%
        else if (creditScore >= 400) defaultProbability = 0.25;  // 25%
        else if (creditScore > 0) defaultProbability = 0.40;     // 40%
        else defaultProbability = 0.50;                          // 50% (no score)

        // Adjust theo collateral ratio (thế chấp cao = risk thấp hơn)
        if (collateralRatio >= 150) defaultProbability *= 0.5; // Half risk khi full collateral
        else if (collateralRatio >= 100) defaultProbability *= 0.7;

        // Adjust theo loan amount (khoản vay lớn = risk cao hơn)
        if (request.loanAmount > 5000) defaultProbability *= 1.2;
        if (request.loanAmount > 10000) defaultProbability *= 1.3;

        // Adjust theo duration (vay dài hạn = risk cao hơn)
        if ((request.durationDays || 30) > 90) defaultProbability *= 1.15;
        if ((request.durationDays || 30) > 180) defaultProbability *= 1.3;

        defaultProbability = Math.min(0.9, Math.max(0.01, defaultProbability));

        // Risk level
        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        if (defaultProbability < 0.1) riskLevel = 'LOW';
        else if (defaultProbability < 0.25) riskLevel = 'MEDIUM';
        else riskLevel = 'HIGH';

        // Risk-adjusted return
        const interestAmount = (request.loanAmount * request.interestRate * (request.durationDays || 30)) / (365 * 100);
        const expectedLoss = request.loanAmount * defaultProbability * (1 - collateralRatio / 100);
        const riskAdjustedReturn = Math.round((interestAmount - Math.max(0, expectedLoss)) * 100) / 100;

        return {
            defaultProbability: Math.round(defaultProbability * 1000) / 10, // Percentage
            riskLevel,
            riskScore: Math.round((1 - defaultProbability) * 100), // 0-100, cao = an toàn
            riskAdjustedReturn,
            protectionLevel: collateralRatio >= 150 ? 'FULL' : collateralRatio >= 100 ? 'PARTIAL' : 'MINIMAL',
        };
    }

    /**
     * Lấy lịch sử vay của borrower (cho lender xem)
     */
    private async getBorrowerLoanHistory(borrowerId: string) {
        const loans = await this.loanModel.find({
            borrowerId: new Types.ObjectId(borrowerId),
        }).lean();

        const total = loans.length;
        const repaid = loans.filter(l => l.status === LOAN_STATUS_ENUM.REPAID).length;
        const defaulted = loans.filter(l =>
            l.status === LOAN_STATUS_ENUM.DEFAULTED || l.status === LOAN_STATUS_ENUM.LIQUIDATED
        ).length;
        const active = loans.filter(l => l.status === LOAN_STATUS_ENUM.ACTIVE).length;
        const overdue = loans.filter(l => l.status === LOAN_STATUS_ENUM.OVERDUE).length;

        return {
            totalLoans: total,
            repaidOnTime: repaid,
            activeLoans: active,
            overdueLoans: overdue,
            defaultedLoans: defaulted,
            repaymentRate: total > 0 ? Math.round((repaid / total) * 100) : 0,
            isNewBorrower: total === 0,
        };
    }

    /**
     * Recommendation engine cho lender
     */
    private generateRecommendation(
        enrichedRequest: any,
        borrowerHistory: any,
    ): { action: 'RECOMMENDED' | 'CAUTION' | 'HIGH_RISK'; reasons: string[] } {
        const reasons: string[] = [];
        const risk = enrichedRequest.riskMetrics;
        const credit = enrichedRequest.borrowerRisk;

        if (risk.riskLevel === 'LOW' && credit.creditScore >= 600) {
            reasons.push('Người vay có điểm tín dụng tốt');
            if (borrowerHistory.repaidOnTime > 0) {
                reasons.push(`Đã trả đúng hạn ${borrowerHistory.repaidOnTime} khoản vay`);
            }
            if (credit.collateralRatio >= 100) {
                reasons.push('Mức thế chấp an toàn');
            }
            return { action: 'RECOMMENDED', reasons };
        }

        if (risk.riskLevel === 'MEDIUM') {
            reasons.push(`Mức rủi ro trung bình (${risk.defaultProbability}% default)`);
            if (borrowerHistory.defaultedLoans > 0) {
                reasons.push(`Cảnh báo: Đã có ${borrowerHistory.defaultedLoans} lần vỡ nợ`);
            }
            if (credit.creditScore < 500) {
                reasons.push('Điểm tín dụng dưới trung bình');
            }
            return { action: 'CAUTION', reasons };
        }

        reasons.push(`Rủi ro cao (${risk.defaultProbability}% khả năng mất vốn)`);
        if (!credit.hasValidScore) reasons.push('Chưa có điểm tín dụng');
        if (borrowerHistory.isNewBorrower) reasons.push('Người vay mới, chưa có lịch sử');
        if (borrowerHistory.overdueLoans > 0) reasons.push(`Đang có ${borrowerHistory.overdueLoans} khoản vay quá hạn`);

        return { action: 'HIGH_RISK', reasons };
    }

    private sortRequests(requests: any[], sortBy?: string, sortOrder?: string) {
        const order = sortOrder === 'asc' ? 1 : -1;
        return requests.sort((a, b) => {
            switch (sortBy) {
                case 'rate': return (a.interestRate - b.interestRate) * order;
                case 'amount': return (a.loanAmount - b.loanAmount) * order;
                case 'risk': return (a.riskMetrics.riskScore - b.riskMetrics.riskScore) * order;
                case 'return': return (a.expectedReturn.interestAmount - b.expectedReturn.interestAmount) * order;
                default: return 0;
            }
        });
    }

    private getCollateralLabel(ratio: number): string {
        if (ratio <= 50) return 'Tín chấp (EXCELLENT)';
        if (ratio <= 80) return 'Thế chấp thấp (VERY GOOD)';
        if (ratio <= 100) return 'Thế chấp vừa (GOOD)';
        if (ratio <= 120) return 'Thế chấp cao (FAIR)';
        if (ratio <= 135) return 'Thế chấp rất cao (BELOW FAIR)';
        return 'Thế chấp đầy đủ 150% (POOR)';
    }
}
