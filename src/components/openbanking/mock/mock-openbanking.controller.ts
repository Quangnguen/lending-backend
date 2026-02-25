import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MockOpenBankingService } from './mock-openbanking.service';
import { LinkBankDto, VerifyOtpDto } from '../dto/openbanking.dto';

@ApiTags('Mock Open Banking')
@Controller('mock-banking')
export class MockOpenBankingController {
    constructor(private readonly mockService: MockOpenBankingService) { }

    @Get('banks')
    @ApiOperation({ summary: 'Lấy danh sách ngân hàng hỗ trợ' })
    getBanks() {
        return this.mockService.getBanks();
    }

    @Post('link')
    @ApiOperation({ summary: 'Bước 1: Yêu cầu liên kết (nhập user/pass)' })
    initiateLink(@Body() dto: LinkBankDto) {
        return this.mockService.initiateLink(dto);
    }

    @Post('verify')
    @ApiOperation({ summary: 'Bước 2: Xác thực OTP' })
    verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.mockService.verifyOtp(dto);
    }

    @Get('accounts/:username')
    @ApiOperation({ summary: 'Lấy danh sách tài khoản của user' })
    getAccounts(@Param('username') username: string) {
        return this.mockService.getAccounts(username);
    }

    @Get('transactions/:username')
    @ApiOperation({ summary: 'Lấy lịch sử giao dịch' })
    getTransactions(@Param('username') username: string) {
        return this.mockService.getTransactions(username);
    }

    @Get('credit-score/:username')
    @ApiOperation({ summary: 'Tính điểm tín dụng giả lập' })
    getCreditScore(@Param('username') username: string) {
        return this.mockService.calculateCreditScore(username);
    }
}