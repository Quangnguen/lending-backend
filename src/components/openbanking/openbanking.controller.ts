import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

import { OpenBankingService } from './openbanking.service';
import { CreateLinkTokenResponseDto } from './dto/create-link-token.dto';
import {
  ExchangeTokenDto,
  ExchangeTokenResponseDto,
} from './dto/exchange-token.dto';
import { GetTransactionsDto, TransactionDto } from './dto/get-transactions.dto';

@ApiTags('Open Banking')
@ApiBearerAuth()
@Controller('openbanking')
export class OpenBankingController {
  constructor(private readonly openBankingService: OpenBankingService) {}

  @Post('link-token')
  @ApiOperation({ summary: 'Create Link Token' })
  @ApiResponse({ status: 201, type: CreateLinkTokenResponseDto })
  async createLinkToken(@Request() req): Promise<CreateLinkTokenResponseDto> {
    const userId = req.user._id.toString();
    return this.openBankingService.createLinkToken(userId);
  }

  @Post('exchange-token')
  @ApiOperation({ summary: 'Exchange Public Token for Access Token' })
  @ApiResponse({ status: 201, type: ExchangeTokenResponseDto })
  async exchangePublicToken(
    @Request() req,
    @Body() dto: ExchangeTokenDto,
  ): Promise<ExchangeTokenResponseDto> {
    const userId = req.user._id.toString();
    return this.openBankingService.exchangePublicToken(userId, dto);
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Get Transactions' })
  @ApiResponse({ status: 200, type: [TransactionDto] })
  async getTransactions(
    @Request() req,
    @Body() dto: GetTransactionsDto,
  ): Promise<TransactionDto[]> {
    const userId = req.user._id.toString();
    return this.openBankingService.getTransactions(userId, dto);
  }

  @Get('connections')
  @ApiOperation({ summary: 'Get Bank Connections' })
  async getUserConnections(@Request() req) {
    const userId = req.user._id.toString();
    return this.openBankingService.getUserConnections(userId);
  }

  @Get('connections/:connectionId/balances')
  @ApiOperation({ summary: 'Get Account Balances for a Bank Connection' })
  async getConnectionBalances(
    @Request() req,
    @Param('connectionId') connectionId: string,
  ) {
    const userId = req.user._id.toString();
    return this.openBankingService.getAccountBalances(userId, connectionId);
  }

  @Delete('connections/:connectionId')
  @ApiOperation({ summary: 'Delete a Bank Connection' })
  async deleteConnection(
    @Request() req,
    @Param('connectionId') connectionId: string,
  ) {
    const userId = req.user._id.toString();
    return this.openBankingService.disconnectBank(userId, connectionId);
  }
}
