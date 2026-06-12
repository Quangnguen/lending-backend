import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MockOpenBankingService } from './mock-openbanking.service';
import { VietQRService } from '../vietqr.service';
import {
  GenerateQRDto,
  GenerateQRResponseDto,
  BankConnectionResponse,
} from '../dto/openbanking.dto';

@ApiTags('Open Banking (VietQR)')
@Controller('openbanking')
export class MockOpenBankingController {
  constructor(
    private readonly mockService: MockOpenBankingService,
    private readonly vietqrService: VietQRService,
  ) {}

  // ===== VietQR Real APIs =====

  @Get('banks')
  @ApiOperation({ summary: 'Lấy danh sách ngân hàng từ VietQR API' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách ngân hàng hỗ trợ chuyển khoản VietQR',
  })
  async getBanks() {
    return this.vietqrService.getBanks();
  }

  @Post('qr/generate')
  @ApiOperation({ summary: 'Tạo mã QR thanh toán VietQR' })
  @ApiResponse({ status: 201, type: GenerateQRResponseDto })
  async generateQR(@Body() dto: GenerateQRDto): Promise<GenerateQRResponseDto> {
    return this.vietqrService.generateQRCode(dto);
  }

  @Get('qr/loan-payment')
  @ApiOperation({ summary: 'Tạo QR thanh toán khoản vay' })
  @ApiResponse({ status: 200, type: GenerateQRResponseDto })
  async generateLoanPaymentQR(
    @Query('loanId') loanId: string,
    @Query('bankCode') bankCode: string,
    @Query('accountNumber') accountNumber: string,
    @Query('accountName') accountName: string,
    @Query('amount') amount: string,
  ): Promise<GenerateQRResponseDto> {
    return this.vietqrService.generateLoanPaymentQR(
      loanId,
      bankCode,
      accountNumber,
      accountName,
      Number(amount),
    );
  }

  // ===== Mock Link Bank Flow =====

  @Post('link')
  @ApiOperation({
    summary: 'Bước 1: Yêu cầu liên kết ngân hàng (nhập STK + Tên)',
  })
  @ApiResponse({ status: 201, type: BankConnectionResponse })
  async initiateLink(@Body() dto: any): Promise<BankConnectionResponse> {
    // ValidationPipe wraps body into { request, responseError }
    const data = dto.request || dto;
    console.log('=== LINK BANK DATA ===', JSON.stringify(data));
    return this.mockService.initiateLink(data);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Bước 2: Xác thực OTP (Demo: 123456)' })
  @ApiResponse({ status: 201, type: BankConnectionResponse })
  async verifyOtp(
    @Body() dto: any,
    @Request() req,
  ): Promise<BankConnectionResponse> {
    // ValidationPipe wraps body into { request, responseError }
    const data = dto.request || dto;
    // Lấy userId từ global AuthenGuard để persist vào MongoDB
    const userId = req.user?._id?.toString() || dto.userId;
    return this.mockService.verifyOtp(data, userId);
  }

  // ===== Mock Data APIs =====

  @Get('accounts/:username')
  @ApiOperation({ summary: 'Lấy danh sách tài khoản đã liên kết (mock)' })
  async getAccounts(@Param('username') username: string) {
    return this.mockService.getAccounts(username);
  }

  @Get('transactions/:accountId')
  @ApiOperation({ summary: 'Lấy lịch sử giao dịch theo tài khoản (mock)' })
  async getTransactions(@Param('accountId') accountId: string) {
    return this.mockService.getTransactions(accountId);
  }

  @Get('credit-score/:username')
  @ApiOperation({
    summary: 'Tính điểm tín dụng dựa trên dữ liệu ngân hàng (mock)',
  })
  async getCreditScore(@Param('username') username: string) {
    return this.mockService.calculateCreditScore(username);
  }
}
