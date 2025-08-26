import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { BaseResponseDto } from '@core/dto/base.response.dto';

export class GetUserDetailResponseDto extends BaseResponseDto {
  @ApiProperty()
  @Expose()
  fullname: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  phone: string;

  @ApiProperty()
  @Expose()
  role: number;

  @ApiProperty()
  @Expose()
  is2FA: number;

  @ApiProperty()
  @Expose()
  isLocked: number;

  @ApiProperty()
  @Expose()
  gender: number;

  @ApiProperty()
  @Expose()
  avatar: string;

  @ApiProperty()
  @Expose()
  twoFactorSecret: string;

  @ApiProperty()
  @Expose()
  accountBalance: number;
}
