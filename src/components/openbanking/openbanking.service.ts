import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import * as CrytoJS from 'crypto-js';
import {
  BankConnection,
  BankConnectionDocument,
} from './schemas/bank-connection.schema';
import { CreateLinkTokenResponseDto } from './dto/create-link-token.dto';
import {
  ExchangeTokenDto,
  ExchangeTokenResponseDto,
} from './dto/exchange-token.dto';
import { GetTransactionsDto, TransactionDto } from './dto/get-transactions.dto';

@Injectable()
export class OpenBankingService {
  private plaidClient: PlaidApi;
  private encryptionKey: string;

  constructor(
    @InjectModel(BankConnection.name)
    private bankConnectionModel: Model<BankConnectionDocument>,
    private configService: ConfigService,
  ) {
    const configuration = new Configuration({
      basePath:
        PlaidEnvironments[this.configService.get('openbanking.plaidEnv')],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.configService.get(
            'openbanking.plaidClientId',
          ),
          'PLAID-SECRET': this.configService.get('openbanking.plaidSecret'),
        },
      },
    });
    this.plaidClient = new PlaidApi(configuration);
    this.encryptionKey = this.configService.get('auth.secret');
  }

  /**
   * Tạo Link Token để khởi tạo Plaid Link trên frontend
   */
  async createLinkToken(userId: string): Promise<CreateLinkTokenResponseDto> {
    try {
      const response = await this.plaidClient.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'Lending App',
        products: [Products.Transactions, Products.Auth],
        country_codes: [CountryCode.Us],
        language: 'en',
      });

      return {
        linkToken: response.data.link_token,
        expiration: response.data.expiration,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to create link token: ${error.message}`,
      );
    }
  }

  /**
   * Đổi Public Token thành Access Token và lưu kết nối
   */
  async exchangePublicToken(
    userId: string,
    dto: ExchangeTokenDto,
  ): Promise<ExchangeTokenResponseDto> {
    try {
      const exchangeResponse = await this.plaidClient.itemPublicTokenExchange({
        public_token: dto.publicToken,
      });

      const accessToken = exchangeResponse.data.access_token;
      const itemId = exchangeResponse.data.item_id;

      const itemResponse = await this.plaidClient.itemGet({
        access_token: accessToken,
      });
      const institutionId = itemResponse.data.item.institution_id;

      const institutionResponse = await this.plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      const institutionName = institutionResponse.data.institution.name;

      const accountsResponse = await this.plaidClient.accountsGet({
        access_token: accessToken,
      });

      const encryptedToken = this.encryptToken(accessToken);

      const connection = await this.bankConnectionModel.create({
        userId: new Types.ObjectId(userId),
        accessToken: encryptedToken,
        itemId,
        institutionId,
        institutionName,
        accounts: accountsResponse.data.accounts.map((acc) => acc.account_id),
        lastSyncedAt: new Date(),
      });

      return {
        connectionId: connection._id.toString(),
        institutionName,
        accounts: accountsResponse.data.accounts.map((acc) => ({
          accountId: acc.account_id,
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype,
          mask: acc.mask,
        })),
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to exchange public token: ${error.message}`,
      );
    }
  }

  /**
   * Lấy lịch sử giao dịch từ ngân hàng
   */
  async getTransactions(
    userId: string,
    dto: GetTransactionsDto,
  ): Promise<TransactionDto[]> {
    const connection = await this.bankConnectionModel.findOne({
      _id: dto.connectionId,
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!connection) {
      throw new NotFoundException('Bank connection not found');
    }

    const accessToken = this.decryptToken(connection.accessToken);

    try {
      const response = await this.plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: dto.startDate,
        end_date: dto.endDate || new Date().toISOString().split('T')[0],
      });

      await this.bankConnectionModel.updateOne(
        { _id: connection._id },
        { lastSyncedAt: new Date() },
      );

      return response.data.transactions.map((tx) => ({
        transactionId: tx.transaction_id,
        accountId: tx.account_id,
        amount: tx.amount,
        currency: tx.iso_currency_code,
        date: tx.date,
        name: tx.name,
        merchantName: tx.merchant_name,
        category: tx.category,
        pending: tx.pending,
      }));
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch transactions: ${error.message}`,
      );
    }
  }

  /**
   * Lấy số dư tài khoản
   */
  async getAccountBalances(userId: string, connectionId: string) {
    const connection = await this.bankConnectionModel.findOne({
      _id: connectionId,
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!connection) {
      throw new NotFoundException('Bank connection not found');
    }

    const accessToken = this.decryptToken(connection.accessToken);

    try {
      const response = await this.plaidClient.accountsBalanceGet({
        access_token: accessToken,
      });
      return response.data.accounts.map((acc) => ({
        accountId: acc.account_id,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype,
        mask: acc.mask,
        balance: acc.balances,
      }));
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch account balances: ${error.message}`,
      );
    }
  }

  /**
   * Lấy danh sách kết nối ngân hàng của user
   */
  async getUserConnections(userId: string) {
    const connections = await this.bankConnectionModel.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    });
    return connections.map((conn) => ({
      connectionId: conn._id.toString(),
      institutionName: conn.institutionName,
      linkedAt: conn['createdAt'],
    }));
  }

  /**
   * Ngắt kết nối ngân hàng
   */
  async disconnectBank(userId: string, connectionId: string) {
    const connection = await this.bankConnectionModel.findOne({
      _id: connectionId,
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!connection) {
      throw new NotFoundException('Bank connection not found');
    }

    const accessToken = this.decryptToken(connection.accessToken);

    try {
      await this.plaidClient.itemRemove({ access_token: accessToken });
    } catch (error) {
      throw new BadRequestException(
        `Failed to remove item from Plaid: ${error.message}`,
      );
    }

    await this.bankConnectionModel.updateOne(
      { _id: connection._id },
      { isActive: false },
    );

    return { success: true };
  }

  // Helper methods for encryption
  private encryptToken(token: string): string {
    return CryptoJS.AES.encrypt(token, this.encryptionKey).toString();
  }

  private decryptToken(encryptedToken: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}
