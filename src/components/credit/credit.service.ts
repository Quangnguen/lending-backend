import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreditScore, CreditScoreDocument } from '@database/schemas/credit-score.model';
import { OpenBankingService } from '../openbanking/openbanking.service';
import { MockOpenBankingService } from '../openbanking/mock/mock-openbanking.service';

@Injectable()
export class CreditService {
    private readonly logger = new Logger(CreditService.name);

    constructor(
        @InjectModel(CreditScore.name)
        private creditScoreModel: Model<CreditScoreDocument>,
        private openBankingService: OpenBankingService,
        private mockOpenBankingService: MockOpenBankingService,
    ) { }

    /**
     * Tính Credit Score dựa trên dữ liệu Open Banking thật của user.
     * 
     * Luồng:
     * 1. Lấy danh sách tài khoản NH đã liên kết (từ BankConnection trong MongoDB)
     * 2. Nếu có → tính score dựa trên số lượng tài khoản liên kết + dữ liệu giao dịch mock
     * 3. Nếu chưa liên kết → dùng mock data demo (fallback)
     * 4. Lưu kết quả vào DB
     */
    async calculateCreditScore(userId: string): Promise<CreditScore> {
        this.logger.log(`Calculating credit score for user ${userId}`);

        // === 1. Lấy tài khoản NH đã liên kết THẬT (từ OpenBankingService) ===
        const bankConnections = await this.openBankingService.getUserConnections(userId);
        const hasRealConnections = bankConnections && bankConnections.length > 0;

        let totalIncome = 0;
        let totalSpending = 0;
        let currentBalance = 0;
        let transactionCount = 0;
        let connectionHistoryScore = 0;
        let linkedAccountsCount = 0;

        if (hasRealConnections) {
            // === TRƯỜNG HỢP 1: User đã liên kết ngân hàng thật ===
            this.logger.log(`User ${userId} has ${bankConnections.length} real bank connections`);
            linkedAccountsCount = bankConnections.length;

            // Tính điểm từ lịch sử liên kết
            for (const conn of bankConnections) {
                if (conn.linkedAt) {
                    const linkedDate = new Date(conn.linkedAt);
                    const monthsLinked = (Date.now() - linkedDate.getTime()) / (1000 * 3600 * 24 * 30);
                    connectionHistoryScore = Math.max(connectionHistoryScore, monthsLinked);
                }
            }

            // Lấy giao dịch từ mock data (mô phỏng lấy từ API ngân hàng)
            // Trong thực tế sẽ gọi API Open Banking để lấy transaction history
            const mockAccounts = await this.mockOpenBankingService.getAccounts('demo_user');
            for (const acc of mockAccounts) {
                currentBalance += acc.balance || 0;
                try {
                    const transactions = await this.mockOpenBankingService.getTransactions(acc.id);
                    transactions.forEach(tx => {
                        transactionCount++;
                        if (tx.type === 'IN') {
                            totalIncome += tx.amount;
                        } else if (tx.type === 'OUT') {
                            totalSpending += tx.amount;
                        }
                    });
                } catch (error) {
                    this.logger.error(`Error fetching transactions for account ${acc.id}: ${error.message}`);
                }
            }
        } else {
            // === TRƯỜNG HỢP 2: Chưa liên kết NH → Dùng mock data (demo) ===
            this.logger.warn(`User ${userId} has no bank connections - using mock data`);

            const accounts = await this.mockOpenBankingService.getAccounts('demo_user');
            if (!accounts || accounts.length === 0) {
                throw new BadRequestException(
                    'Chưa có dữ liệu ngân hàng. Vui lòng liên kết tài khoản ngân hàng trước.',
                );
            }

            for (const acc of accounts) {
                currentBalance += acc.balance || 0;
                try {
                    const transactions = await this.mockOpenBankingService.getTransactions(acc.id);
                    transactions.forEach(tx => {
                        transactionCount++;
                        if (tx.type === 'IN') {
                            totalIncome += tx.amount;
                        } else if (tx.type === 'OUT') {
                            totalSpending += tx.amount;
                        }
                    });
                } catch (error) {
                    this.logger.error(`Error fetching transactions for account ${acc.id}: ${error.message}`);
                }
            }
        }

        // === 2. Tính điểm thành phần ===
        const incomeScore = this.calculateIncomeScore(totalIncome);           // Max 250
        const spendingScore = this.calculateSpendingScore(totalIncome, totalSpending); // Max 200
        const balanceScore = this.calculateBalanceScore(currentBalance);       // Max 200
        const consistencyScore = this.calculateConsistencyScore(transactionCount); // Max 150
        const historyScore = hasRealConnections
            ? this.calculateHistoryScore(connectionHistoryScore)              // Max 100
            : 30; // Điểm mặc định thấp khi chưa liên kết NH
        const connectionBonus = this.calculateConnectionBonus(linkedAccountsCount); // Max 100

        const totalScore = incomeScore + spendingScore + balanceScore +
            consistencyScore + historyScore + connectionBonus;

        // === 3. Xếp loại và Hạn mức ===
        let rating = 'POOR';
        if (totalScore >= 800) {
            rating = 'EXCELLENT';
        } else if (totalScore >= 650) {
            rating = 'GOOD';
        } else if (totalScore >= 500) {
            rating = 'FAIR';
        } else {
            rating = 'POOR';
        }

        // Hạn mức = dựa trên score + thu nhập, có bonus nếu đã liên kết NH
        const monthlyIncome = totalIncome / 3;
        const baseLimit = Math.min(totalScore * 10, monthlyIncome * 0.5);
        // Bonus 20% hạn mức nếu đã liên kết ngân hàng thật
        const connectionMultiplier = hasRealConnections ? 1.2 : 1.0;
        const loanLimit = Math.round(baseLimit * connectionMultiplier);

        // === 4. Lưu vào DB ===
        const newScore = await this.creditScoreModel.create({
            userId: new Types.ObjectId(userId),
            score: Math.round(Math.min(totalScore, 1000)),
            breakdown: {
                incomeScore,
                spendingScore,
                balanceScore,
                consistencyScore,
                historyScore: historyScore + connectionBonus,
            },
            rating,
            loanLimit,
            calculatedAt: new Date(),
        });

        this.logger.log(
            `Credit Score for user ${userId}: ${newScore.score}/1000 (${rating}) | ` +
            `Linked banks: ${linkedAccountsCount} | Loan limit: ${loanLimit} | ` +
            `Source: ${hasRealConnections ? 'REAL Open Banking' : 'MOCK data'}`
        );

        return newScore;
    }

    // --- Helper Methods ---

    /** Điểm thu nhập — Max 250 */
    private calculateIncomeScore(totalIncome: number): number {
        const monthlyAvg = totalIncome / 3;
        if (monthlyAvg >= 2000) return 250;
        return Math.min(Math.round((monthlyAvg / 2000) * 250), 250);
    }

    /** Điểm chi tiêu — Max 200 */
    private calculateSpendingScore(income: number, spending: number): number {
        if (income === 0) return 0;
        const ratio = spending / income;
        if (ratio <= 0.5) return 200;
        if (ratio >= 1.0) return 0;
        return Math.round(200 * (1 - (ratio - 0.5) * 2));
    }

    /** Điểm số dư — Max 200 */
    private calculateBalanceScore(balance: number): number {
        if (balance >= 5000) return 200;
        return Math.min(Math.round((balance / 5000) * 200), 200);
    }

    /** Điểm tần suất giao dịch — Max 150 */
    private calculateConsistencyScore(txCount: number): number {
        if (txCount >= 30) return 150;
        return Math.round((txCount / 30) * 150);
    }

    /** Điểm lịch sử liên kết NH — Max 100 */
    private calculateHistoryScore(monthsLinked: number): number {
        if (monthsLinked >= 6) return 100;
        return Math.min(Math.round((monthsLinked / 6) * 100), 100);
    }

    /** Điểm thưởng số lượng NH liên kết — Max 100 */
    private calculateConnectionBonus(connectionCount: number): number {
        if (connectionCount === 0) return 0;
        if (connectionCount === 1) return 30;
        if (connectionCount === 2) return 60;
        return 100; // 3+ ngân hàng
    }

    async getLatestScore(userId: string): Promise<CreditScore | null> {
        return this.creditScoreModel.findOne({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .exec();
    }
}