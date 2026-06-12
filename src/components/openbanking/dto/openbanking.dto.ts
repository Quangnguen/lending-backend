import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

// ===== VietQR Bank Interface (from VietQR API) =====
export interface VietQRBank {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo: string;
  transferSupported: number;
  lookupSupported: number;
  swift_code: string | null;
}

// ===== Legacy interfaces for backward compatibility =====
export interface Bank {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  code?: string;
  bin?: string;
  transferSupported?: boolean;
  lookupSupported?: boolean;
  swiftCode?: string | null;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankName?: string;
  bankLogo?: string;
  accountNumber: string;
  accountName: string;
  balance: number;
  currency: string;
  type: 'SAVINGS' | 'CURRENT';
}

export interface BankTransaction {
  id: string;
  accountId: string;
  amount: number;
  type: 'IN' | 'OUT';
  description: string;
  date: Date;
  beneficiary?: string;
}

// ===== DTOs for VietQR =====
export class GenerateQRDto {
  @ApiProperty({
    description: 'Mã ngân hàng (VietQR bank code)',
    example: 'VCB',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({
    description: 'Số tài khoản người nhận',
    example: '0011001234567',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({
    description: 'Tên tài khoản người nhận',
    example: 'NGUYEN VAN A',
  })
  @IsString()
  @IsOptional()
  accountName?: string;

  @ApiPropertyOptional({
    description: 'Số tiền cần chuyển (VND)',
    example: 1000000,
  })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Nội dung chuyển khoản',
    example: 'Thanh toan khoan vay #123',
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class GenerateQRResponseDto {
  @ApiProperty()
  qrDataUrl: string;

  @ApiProperty()
  bankCode: string;

  @ApiProperty()
  bankName: string;

  @ApiProperty()
  accountNumber: string;

  @ApiPropertyOptional()
  accountName?: string;

  @ApiPropertyOptional()
  amount?: number;

  @ApiPropertyOptional()
  description?: string;
}

// ===== DTOs for Mock Link Bank =====
export class LinkBankDto {
  @ApiProperty({ description: 'Mã ngân hàng VietQR', example: 'VCB' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ description: 'Số tài khoản', example: '0011001234567' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({ description: 'Tên chủ tài khoản', example: 'NGUYEN VAN A' })
  @IsString()
  @IsNotEmpty()
  accountName: string;
}

export class VerifyOtpDto {
  @ApiProperty({ description: 'Transaction ID từ bước liên kết' })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({ description: 'Mã OTP (demo: 123456)', example: '123456' })
  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class BankConnectionResponse {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  transactionId?: string;

  @ApiPropertyOptional()
  data?: any;
}
