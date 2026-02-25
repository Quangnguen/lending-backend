import { Controller, Get, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreditService } from "./credit.service";

@ApiTags('Credit')
@Controller('credit')
@ApiBearerAuth()
export class CreditController {
    constructor(private readonly creditService: CreditService) { }

    @Get('score')
    @ApiOperation({ summary: 'Get latest credit score for the logged-in user' })
    async getScore(@Request() req) {
        const userId = req.user.id;
        const score = await this.creditService.getLatestScore(userId);

        if (!score) {
            return this.creditService.calculateCreditScore(userId);
        }

        return score;
    }

    @Post('calculate')
    @ApiOperation({ summary: 'Force recalculate credit score' })
    async calculateScore(@Request() req) {
        const userId = req.user.id;
        return this.creditService.calculateCreditScore(userId);
    }
}