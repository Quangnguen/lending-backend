import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { BaseResponseDto } from '@core/dto/base.response.dto';

export class GetUserDetailResponseDto extends BaseResponseDto {
  @ApiProperty()
  @Expose()
  fullName: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  phone: string;

  @ApiProperty()
  @Expose()
  role: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  gender: string;

  @ApiProperty()
  @Expose()
  avatarUrl: string;

  @ApiProperty()
  @Expose()
  dateOfBirth: Date;

  @ApiProperty()
  @Expose()
  address: string;

  @ApiProperty()
  @Expose()
  city: string;

  @ApiProperty()
  @Expose()
  country: string;

  @ApiProperty()
  @Expose()
  balance: number;

  @ApiProperty()
  @Expose()
  creditScore: number;

  @ApiProperty()
  @Expose()
  reputationScore: number;

  @ApiProperty()
  @Expose()
  totalBorrowed: number;

  @ApiProperty()
  @Expose()
  totalLent: number;

  @ApiProperty()
  @Expose()
  successfulLoans: number;

  @ApiProperty()
  @Expose()
  defaultedLoans: number;

  @ApiProperty()
  @Expose()
  isVerified: boolean;

  @ApiProperty()
  @Expose()
  kycStatus: string;

  @ApiProperty()
  @Expose()
  walletAddress: string;
}
