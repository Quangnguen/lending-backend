import { Controller, Get, Post, Param, Request, UseGuards, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CreditService } from "./credit.service";
import { CreditScoringEngine } from "./credit-scoring.engine";

@ApiTags('Credit')
@Controller('credit')
@ApiBearerAuth()
export class CreditController {
    constructor(
        private readonly creditService: CreditService,
        private readonly creditScoringEngine: CreditScoringEngine,
    ) { }

    @Get('score')
    @ApiOperation({ summary: 'Get latest credit score for the logged-in user' })
    async getScore(@Request() req) {
        const userId = req.user.id;
        const score = await this.creditScoringEngine.getLatestScore(userId);

        if (!score) {
            return this.creditScoringEngine.calculateScore(userId);
        }

        // Thêm collateral ratio vào response
        return {
            ...score,
            collateralRatio: this.creditScoringEngine.getRequiredCollateralRatio(score.score),
        };
    }

    @Post('calculate')
    @ApiOperation({ summary: 'Force recalculate credit score using enhanced engine (Open Banking + Loan History)' })
    async calculateScore(@Request() req) {
        const userId = req.user.id;
        const score = await this.creditScoringEngine.calculateScore(userId);

        return {
            ...score,
            collateralRatio: this.creditScoringEngine.getRequiredCollateralRatio(score.score),
        };
    }

    @Get('history')
    @ApiOperation({ summary: 'Get credit score history (track score changes over time)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng records (default: 10)' })
    async getScoreHistory(@Request() req, @Query('limit') limit?: string) {
        const userId = req.user.id;
        const scores = await this.creditScoringEngine.getScoreHistory(userId, Number(limit) || 10);

        return {
            history: scores.map(s => ({
                score: s.score,
                rating: s.rating,
                loanLimit: s.loanLimit,
                breakdown: s.breakdown,
                collateralRatio: this.creditScoringEngine.getRequiredCollateralRatio(s.score),
                calculatedAt: s.calculatedAt,
            })),
            trend: scores.length >= 2
                ? (scores[0].score > scores[1].score ? 'UP' : scores[0].score < scores[1].score ? 'DOWN' : 'STABLE')
                : 'NEW',
        };
    }

    @Get('collateral-ratio')
    @ApiOperation({ summary: 'Get required collateral ratio based on current credit score' })
    async getCollateralRatio(@Request() req) {
        const userId = req.user.id;
        const score = await this.creditScoringEngine.getLatestScore(userId);

        if (!score) {
            return {
                score: 0,
                rating: 'UNRATED',
                collateralRatio: 150,
                message: 'Chưa có điểm tín dụng. Vui lòng tính điểm trước.',
            };
        }

        const collateralRatio = this.creditScoringEngine.getRequiredCollateralRatio(score.score);

        return {
            score: score.score,
            rating: score.rating,
            collateralRatio,
            collateralRatioDescription: this.getCollateralDescription(collateralRatio),
            loanLimit: score.loanLimit,
        };
    }

    // Legacy endpoint - dùng CreditService cũ (backward compatible)
    @Post('calculate-legacy')
    @ApiOperation({ summary: '[Legacy] Calculate credit score using original algorithm' })
    async calculateScoreLegacy(@Request() req) {
        const userId = req.user.id;
        return this.creditService.calculateCreditScore(userId);
    }

    // ===== Helpers =====

    private getCollateralDescription(ratio: number): string {
        if (ratio <= 50) return 'Tín chấp/Thế chấp rất thấp (EXCELLENT) — Chỉ cần 50% giá trị khoản vay';
        if (ratio <= 80) return 'Thế chấp thấp (VERY GOOD) — Cần 80% giá trị khoản vay';
        if (ratio <= 100) return 'Thế chấp vừa phải (GOOD) — Cần 100% giá trị khoản vay';
        if (ratio <= 120) return 'Thế chấp tiêu chuẩn (FAIR) — Cần 120% giá trị khoản vay';
        if (ratio <= 135) return 'Thế chấp cao (BELOW FAIR) — Cần 135% giá trị khoản vay';
        return 'Thế chấp đầy đủ (POOR) — Cần 150% giá trị khoản vay (tương tự DeFi thuần túy)';
    }

    // ===== Admin Endpoints =====

    /**
     * [Admin] Lấy điểm tín dụng mới nhất của tất cả user (dùng aggregate)
     * GET /credit/admin/scores
     */
    @Get('admin/scores')
    @ApiOperation({ summary: '[Admin] Get latest credit score of all users' })
    async getAdminScores() {
        const latestScores = await this.creditScoringEngine.getLatestScoresForAllUsers();
        return { success: true, data: latestScores };
    }

    /**
     * [Admin] Lấy điểm tín dụng của 1 user theo userId
     * GET /credit/admin/score/:userId
     */
    @Get('admin/score/:userId')
    @ApiOperation({ summary: '[Admin] Get latest credit score of a specific user' })
    async getAdminUserScore(@Param('userId') userId: string) {
        const score = await this.creditScoringEngine.getLatestScore(userId);
        return {
            success: true,
            data: score ? {
                userId,
                score: score.score,
                rating: score.rating,
                loanLimit: score.loanLimit,
                calculatedAt: score.calculatedAt,
            } : { userId, score: 0, rating: 'UNRATED', loanLimit: 0, calculatedAt: null },
        };
    }
}