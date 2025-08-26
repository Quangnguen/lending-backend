import { BaseDto } from '@core/dto/base.request.dto';
import { AUTH_CONST } from '@components/auth/auth.constant';

import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordRequestDto extends BaseDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(AUTH_CONST.PASSWORD.MIN_LENGTH)
  @MaxLength(AUTH_CONST.PASSWORD.MAX_LENGTH)
  oldPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(AUTH_CONST.PASSWORD.MIN_LENGTH)
  @MaxLength(AUTH_CONST.PASSWORD.MAX_LENGTH)
  newPassword: string;
}
