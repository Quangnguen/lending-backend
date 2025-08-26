import { IsNotEmpty, IsString, Length } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';
import { AUTH_CONST } from '@components/auth/auth.constant';

export class VerifyLogin2FARequestDto extends BaseDto {
  @IsNotEmpty()
  @IsString()
  @Length(AUTH_CONST.OTP_2FA_LENGTH)
  otp: string;

  @IsNotEmpty()
  @IsString()
  token2FA: string;
}
