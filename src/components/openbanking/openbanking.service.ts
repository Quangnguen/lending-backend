import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as CryptoJS from 'crypto-js';
import { ConfigService } from '@nestjs/config';
import {
  BankConnection,
  BankConnectionDocument,
} from './schemas/bank-connection.schema';
import { VietQRService } from './vietqr.service';

/**
 * OpenBankingService - Quản lý kết nối ngân hàng và VietQR
 *
 * Kiến trúc:
 * - VietQRService: Gọi VietQR API thật (bank list, QR generation)
 * - OpenBankingService: Quản lý bank connections trong DB
 * - MockOpenBankingService: Tạo dữ liệu demo cho flow link bank
 */
@Injectable()
export class OpenBankingService {
  private readonly logger = new Logger(OpenBankingService.name);
  private readonly encryptionKey: string;

  constructor(
    @InjectModel(BankConnection.name)
    private bankConnectionModel: Model<BankConnectionDocument>,
    private configService: ConfigService,
    private vietqrService: VietQRService,
  ) {
    this.encryptionKey = this.configService.get('auth.secret') || 'default-secret';
  }

  /**
   * Lưu kết nối ngân hàng mới
   */
  async createConnection(
    userId: string,
    bankCode: string,
    accountNumber: string,
    accountName: string,
  ) {
    const bank = await this.vietqrService.findBankByCode(bankCode);
    if (!bank) {
      throw new BadRequestException(`Ngân hàng với mã ${bankCode} không tồn tại`);
    }

    // Encrypt account number for security
    const encryptedAccount = this.encryptToken(accountNumber);

    const connection = await this.bankConnectionModel.create({
      userId: new Types.ObjectId(userId),
      bankCode: bankCode,
      bankName: bank.shortName,
      bankLogo: bank.logo,
      accountNumber: encryptedAccount,
      accountName: accountName,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    return {
      connectionId: connection._id.toString(),
      bankCode: bankCode,
      bankName: bank.shortName,
      bankLogo: bank.logo,
      accountName: accountName,
      accountNumberMask: this.maskAccountNumber(accountNumber),
    };
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
      bankCode: conn.bankCode,
      bankName: conn.bankName,
      bankLogo: conn.bankLogo,
      accountName: conn.accountName,
      accountNumberMask: this.maskAccountNumber(
        this.decryptToken(conn.accountNumber),
      ),
      linkedAt: conn['createdAt'],
      lastSyncedAt: conn.lastSyncedAt,
    }));
  }

  /**
   * Tạo QR thanh toán cho kết nối cụ thể
   */
  async generatePaymentQR(
    userId: string,
    connectionId: string,
    amount: number,
    description: string,
  ) {
    const connection = await this.bankConnectionModel.findOne({
      _id: connectionId,
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!connection) {
      throw new NotFoundException('Không tìm thấy kết nối ngân hàng');
    }

    const accountNumber = this.decryptToken(connection.accountNumber);

    return this.vietqrService.generateQRCode({
      bankCode: connection.bankCode,
      accountNumber,
      accountName: connection.accountName,
      amount,
      description,
    });
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
      throw new NotFoundException('Không tìm thấy kết nối ngân hàng');
    }

    await this.bankConnectionModel.updateOne(
      { _id: connection._id },
      { isActive: false },
    );

    return { success: true, message: 'Đã ngắt kết nối ngân hàng' };
  }

  // ===== Helper methods =====

  private encryptToken(token: string): string {
    return CryptoJS.AES.encrypt(token, this.encryptionKey).toString();
  }

  private decryptToken(encryptedToken: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  private maskAccountNumber(accountNumber: string): string {
    if (!accountNumber || accountNumber.length < 4) return '****';
    return '****' + accountNumber.slice(-4);
  }
}
