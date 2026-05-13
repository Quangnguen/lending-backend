import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { OpenBankingService } from './openbanking.service';
import { MockOpenBankingService } from './mock/mock-openbanking.service';
import { MOCK_ACCOUNTS } from './mock/vn-banks.data';

@ApiTags('Open Banking - Connections')
@ApiBearerAuth()
@Controller('openbanking/connections')
export class OpenBankingController {
  constructor(
    private readonly openBankingService: OpenBankingService,
    private readonly mockOpenBankingService: MockOpenBankingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Tạo kết nối ngân hàng mới' })
  async createConnection(
    @Request() req,
    @Body() body: any,
  ) {
    // ValidationPipe may wrap body into { request, responseError }
    const data = body.request || body;
    const userId = req.user?._id?.toString() || data.userId;
    return this.openBankingService.createConnection(
      userId,
      data.bankCode,
      data.accountNumber,
      data.accountName,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách kết nối ngân hàng' })
  async getUserConnections(@Request() req) {
    const userId = req.user._id.toString();
    const connections = await this.openBankingService.getUserConnections(userId);

    // Patch balance: nếu DB có balance = 0 (records cũ), lấy từ MOCK_ACCOUNTS trong RAM
    const mockAccounts = MOCK_ACCOUNTS[userId] || [];
    const patched = connections.map(conn => {
      if (conn.balance === 0 && mockAccounts.length > 0) {
        // Tìm theo 4 số cuối của accountNumber
        const last4 = conn.accountNumberMask?.replace(/\*/g, '').slice(-4) || '';
        const mockAcc = mockAccounts.find(a => a.accountNumber?.slice(-4) === last4);
        if (mockAcc?.balance) {
          console.log(`[OpenBanking] Patching balance for ${conn.bankCode} from MOCK: ${mockAcc.balance}`);
          return { ...conn, balance: mockAcc.balance };
        }
      }
      console.log(`[OpenBanking] Connection: bankCode=${conn.bankCode}, balance=${conn.balance}`);
      return conn;
    });

    return patched;
  }

  @Post(':connectionId/qr')
  @ApiOperation({ summary: 'Tạo QR thanh toán cho kết nối ngân hàng' })
  @ApiQuery({ name: 'amount', type: Number, required: true })
  @ApiQuery({ name: 'description', type: String, required: false })
  async generatePaymentQR(
    @Request() req,
    @Param('connectionId') connectionId: string,
    @Body() body: { amount: number; description?: string },
  ) {
    const userId = req.user._id.toString();
    return this.openBankingService.generatePaymentQR(
      userId,
      connectionId,
      body.amount,
      body.description || '',
    );
  }

  @Delete(':connectionId')
  @ApiOperation({ summary: 'Ngắt kết nối ngân hàng' })
  async deleteConnection(
    @Request() req,
    @Param('connectionId') connectionId: string,
  ) {
    const userId = req.user._id.toString();
    return this.openBankingService.disconnectBank(userId, connectionId);
  }
}
