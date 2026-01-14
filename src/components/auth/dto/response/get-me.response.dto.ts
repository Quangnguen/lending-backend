import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { BaseResponseDto } from '@core/dto/base.response.dto';

export class GetMeResponseDto extends BaseResponseDto {
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
  avatarUrl: string;

  @ApiProperty()
  @Expose()
  status: string;

  @ApiProperty()
  @Expose()
  gender: string;

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
  isVerified: boolean;

  @ApiProperty()
  @Expose()
  kycStatus: string;

  @ApiProperty()
  @Expose()
  walletAddress: string;
}
