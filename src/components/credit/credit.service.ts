import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreditScore, CreditScoreDocument } from '@database/schemas/credit-score.model';
import { MockOpenBankingService } from '../openbanking/mock/mock-openbanking.service';

@Injectable()
export class CreditService {
    private readonly logger = new Logger(CreditService.name);

    constructor(
        @InjectModel(CreditScore.name)
        private creditScoreModel: Model<CreditScoreDocument>,
        private mockOpenBankingService: MockOpenBankingService,
    ) { }

    async calculateCreditScore(userId: string): Promise<CreditScore> {
        this.logger.log(`Calculating credit score for user ${userId}`);

        // Sử dụng demo_user cho Mock service
        const username = 'demo_user';

        // 1. Lấy dữ liệu từ Mock Open Banking
        const accounts = await this.mockOpenBankingService.getAccounts(username);
        if (!accounts || accounts.length === 0) {
            throw new BadRequestException('User has no linked bank accounts');
        }

        let totalIncome = 0;
        let totalSpending = 0;
        let currentBalance = 0;
        let transactionCount = 0;

        // Tính tổng số dư từ tất cả tài khoản
        accounts.forEach(acc => {
            currentBalance += acc.balance || 0;
        });

        // Lấy giao dịch từ tất cả tài khoản
        for (const acc of accounts) {
            try {
                const transactions = await this.mockOpenBankingService.getTransactions(acc.id);

                transactions.forEach(tx => {
                    transactionCount++;
                    // Mock data sử dụng type: 'IN' | 'OUT'
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

        // 2. Tính điểm thành phần (Logic đơn giản hóa)
        const incomeScore = this.calculateIncomeScore(totalIncome); // Max 300
        const spendingScore = this.calculateSpendingScore(totalIncome, totalSpending); // Max 250
        const balanceScore = this.calculateBalanceScore(currentBalance); // Max 200
        const consistencyScore = this.calculateConsistencyScore(transactionCount); // Max 150
        const historyScore = 50; // Điểm mặc định cho Mock data (không có connection date)

        const totalScore = incomeScore + spendingScore + balanceScore + consistencyScore + historyScore;

        // 3. Xếp loại và Hạn mức
        let rating = 'POOR';
        let multiplier = 0;

        if (totalScore >= 800) {
            rating = 'EXCELLENT';
            multiplier = 50; // Hạn mức cao
        } else if (totalScore >= 650) {
            rating = 'GOOD';
            multiplier = 30;
        } else if (totalScore >= 500) {
            rating = 'FAIR';
            multiplier = 10;
        } else {
            rating = 'POOR';
            multiplier = 0;
        }

        // Hạn mức = Điểm * Multiplier (VD: 800 * 50 = 40,000 USDT?? Hơi cao, hãy điều chỉnh)
        // Điều chỉnh lại: Hạn mức tối đa = 50% thu nhập trung bình 3 tháng
        const monthlyIncome = totalIncome / 3;
        const loanLimit = Math.min(totalScore * 10, monthlyIncome * 0.5);

        // 4. Lưu vào DB
        const newScore = await this.creditScoreModel.create({
            userId: new Types.ObjectId(userId),
            score: Math.round(totalScore),
            breakdown: {
                incomeScore,
                spendingScore,
                balanceScore,
                consistencyScore,
                historyScore
            },
            rating,
            loanLimit: Math.round(loanLimit),
            calculatedAt: new Date()
        });

        return newScore;
    }

    // --- Helper Methods ---

    private calculateIncomeScore(totalIncome: number): number {
        // 3 tháng thu nhập. Target: 30tr/tháng (~1200 USD) -> Max điểm
        // Giả sử đơn vị là USD
        const monthlyAvg = totalIncome / 3;
        if (monthlyAvg >= 2000) return 300;
        return Math.min(Math.round((monthlyAvg / 2000) * 300), 300);
    }

    private calculateSpendingScore(income: number, spending: number): number {
        if (income === 0) return 0;
        const ratio = spending / income;
        // Chi tiêu < 50% thu nhập là tốt nhất
        if (ratio <= 0.5) return 250;
        if (ratio >= 1.0) return 0; // Chi tiêu vượt thu nhập
        // Từ 50% -> 100%: Điểm giảm dần từ 250 -> 0
        return Math.round(250 * (1 - (ratio - 0.5) * 2));
    }

    private calculateBalanceScore(balance: number): number {
        // Số dư > 5000 USD -> Max điểm
        if (balance >= 5000) return 200;
        return Math.min(Math.round((balance / 5000) * 200), 200);
    }

    private calculateConsistencyScore(txCount: number): number {
        // Có giao dịch thường xuyên (> 30 giao dịch/3 tháng) -> Max
        if (txCount >= 30) return 150;
        return Math.round((txCount / 30) * 150);
    }

    private calculateHistoryScore(oldestDate: Date): number {
        const now = new Date();
        const months = (now.getTime() - oldestDate.getTime()) / (1000 * 3600 * 24 * 30);
        // > 6 tháng -> Max điểm
        if (months >= 6) return 100;
        return Math.min(Math.round((months / 6) * 100), 100);
    }

    async getLatestScore(userId: string): Promise<CreditScore | null> {
        return this.creditScoreModel.findOne({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .exec();
    }
}