import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';
import { AUTH_CONST } from '@components/auth/auth.constant';

export class Change2FASecretRequestDto extends BaseDto {
  @ApiProperty()
  @IsString()
  @Length(AUTH_CONST.OTP_2FA_SECRET_LENGTH)
  @IsNotEmpty()
  twoFactorSecret: string;

  @ApiProperty()
  @IsString()
  @Length(AUTH_CONST.OTP_2FA_LENGTH)
  @IsNotEmpty()
  otp: string;
}
