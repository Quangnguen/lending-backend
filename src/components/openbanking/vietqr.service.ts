import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  VietQRBank,
  Bank,
  GenerateQRDto,
  GenerateQRResponseDto,
} from './dto/openbanking.dto';

@Injectable()
export class VietQRService {
  private readonly logger = new Logger(VietQRService.name);
  private readonly vietqrApiUrl: string;
  private readonly vietqrImageUrl: string;
  private banksCache: Bank[] = [];
  private banksCacheTime: number = 0;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.vietqrApiUrl =
      this.configService.get('openbanking.vietqrApiUrl') ||
      'https://api.vietqr.io/v2';
    this.vietqrImageUrl =
      this.configService.get('openbanking.vietqrImageUrl') ||
      'https://img.vietqr.io/image';
  }

  /**
   * Lấy danh sách ngân hàng từ VietQR API
   * Kết quả được cache 24h để tối ưu performance
   */
  async getBanks(): Promise<Bank[]> {
    // Return cached data if still valid
    if (
      this.banksCache.length > 0 &&
      Date.now() - this.banksCacheTime < this.CACHE_TTL
    ) {
      return this.banksCache;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          code: string;
          desc: string;
          data: VietQRBank[];
        }>(`${this.vietqrApiUrl}/banks`),
      );

      if (response.data?.code === '00' && response.data?.data) {
        this.banksCache = response.data.data
          .filter((bank) => bank.transferSupported === 1) // Chỉ lấy ngân hàng hỗ trợ chuyển khoản
          .map((bank) => this.mapVietQRBankToBank(bank));
        this.banksCacheTime = Date.now();

        this.logger.log(
          `Loaded ${this.banksCache.length} banks from VietQR API`,
        );
        return this.banksCache;
      }

      throw new Error('Invalid response from VietQR API');
    } catch (error) {
      this.logger.error(`Failed to fetch banks from VietQR: ${error.message}`);

      // Fallback: return cached data even if expired
      if (this.banksCache.length > 0) {
        this.logger.warn('Returning stale cache data');
        return this.banksCache;
      }

      // Last resort: return hardcoded popular banks
      return this.getFallbackBanks();
    }
  }

  /**
   * Tìm ngân hàng theo bank code
   */
  async findBankByCode(bankCode: string): Promise<Bank | null> {
    const banks = await this.getBanks();
    return banks.find((b) => b.code === bankCode) || null;
  }

  /**
   * Tạo URL QR code thanh toán VietQR
   * Sử dụng Quick Link API (không cần authentication)
   *
   * Format: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png
   */
  async generateQRCode(dto: GenerateQRDto): Promise<GenerateQRResponseDto> {
    const bank = await this.findBankByCode(dto.bankCode);
    const template = 'compact2'; // Template QR có logo ngân hàng

    // Build QR image URL
    let qrUrl = `${this.vietqrImageUrl}/${dto.bankCode}-${dto.accountNumber}-${template}.png`;

    const params = new URLSearchParams();
    if (dto.amount && dto.amount > 0) {
      params.append('amount', dto.amount.toString());
    }
    if (dto.description) {
      params.append('addInfo', dto.description);
    }
    if (dto.accountName) {
      params.append('accountName', dto.accountName);
    }

    const queryString = params.toString();
    if (queryString) {
      qrUrl += `?${queryString}`;
    }

    return {
      qrDataUrl: qrUrl,
      bankCode: dto.bankCode,
      bankName: bank?.shortName || dto.bankCode,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
      amount: dto.amount,
      description: dto.description,
    };
  }

  /**
   * Tạo QR cho thanh toán khoản vay
   */
  async generateLoanPaymentQR(
    loanId: string,
    bankCode: string,
    accountNumber: string,
    accountName: string,
    amount: number,
  ): Promise<GenerateQRResponseDto> {
    return this.generateQRCode({
      bankCode,
      accountNumber,
      accountName,
      amount,
      description: `Thanh toan khoan vay ${loanId}`,
    });
  }

  // ===== Private Helpers =====

  private mapVietQRBankToBank(vietqrBank: VietQRBank): Bank {
    return {
      id: vietqrBank.id.toString(),
      name: vietqrBank.name,
      shortName: vietqrBank.shortName,
      logo: vietqrBank.logo,
      code: vietqrBank.code,
      bin: vietqrBank.bin,
      transferSupported: vietqrBank.transferSupported === 1,
      lookupSupported: vietqrBank.lookupSupported === 1,
      swiftCode: vietqrBank.swift_code,
    };
  }

  /**
   * Fallback danh sách ngân hàng phổ biến (khi API không available)
   */
  private getFallbackBanks(): Bank[] {
    return [
      {
        id: '43',
        name: 'Ngân hàng TMCP Ngoại Thương Việt Nam',
        shortName: 'Vietcombank',
        code: 'VCB',
        bin: '970436',
        logo: 'https://cdn.vietqr.io/img/VCB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'BFTVVNVX',
      },
      {
        id: '17',
        name: 'Ngân hàng TMCP Công thương Việt Nam',
        shortName: 'VietinBank',
        code: 'ICB',
        bin: '970415',
        logo: 'https://cdn.vietqr.io/img/ICB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'ICBVVNVX',
      },
      {
        id: '4',
        name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
        shortName: 'BIDV',
        code: 'BIDV',
        bin: '970418',
        logo: 'https://cdn.vietqr.io/img/BIDV.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'BIDVVNVX',
      },
      {
        id: '42',
        name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
        shortName: 'Agribank',
        code: 'VBA',
        bin: '970405',
        logo: 'https://cdn.vietqr.io/img/VBA.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'VBAAVNVX',
      },
      {
        id: '21',
        name: 'Ngân hàng TMCP Quân đội',
        shortName: 'MBBank',
        code: 'MB',
        bin: '970422',
        logo: 'https://cdn.vietqr.io/img/MB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'MSCBVNVX',
      },
      {
        id: '38',
        name: 'Ngân hàng TMCP Kỹ thương Việt Nam',
        shortName: 'Techcombank',
        code: 'TCB',
        bin: '970407',
        logo: 'https://cdn.vietqr.io/img/TCB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'VTCBVNVX',
      },
      {
        id: '2',
        name: 'Ngân hàng TMCP Á Châu',
        shortName: 'ACB',
        code: 'ACB',
        bin: '970416',
        logo: 'https://cdn.vietqr.io/img/ACB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'ASCBVNVX',
      },
      {
        id: '47',
        name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng',
        shortName: 'VPBank',
        code: 'VPB',
        bin: '970432',
        logo: 'https://cdn.vietqr.io/img/VPB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'VPBKVNVX',
      },
      {
        id: '39',
        name: 'Ngân hàng TMCP Tiên Phong',
        shortName: 'TPBank',
        code: 'TPB',
        bin: '970423',
        logo: 'https://cdn.vietqr.io/img/TPB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'TPBVVNVX',
      },
      {
        id: '12',
        name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh',
        shortName: 'HDBank',
        code: 'HDB',
        bin: '970437',
        logo: 'https://cdn.vietqr.io/img/HDB.png',
        transferSupported: true,
        lookupSupported: true,
        swiftCode: 'HDBCVNVX',
      },
    ];
  }
}
