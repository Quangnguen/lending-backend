import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';
import { AUTH_CONST } from '@components/auth/auth.constant';

export class ResetPasswordRequestDto extends BaseDto {
  @ApiProperty({
    description: 'Email tài khoản cần đặt lại mật khẩu',
    example: 'user@example.com',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Mã OTP 6 chữ số đã gửi về email',
    example: '123456',
  })
  @IsNotEmpty()
  @IsString()
  otp: string;

  @ApiProperty({ description: 'Mật khẩu mới', example: 'newPass@123' })
  @IsNotEmpty()
  @IsString()
  @MinLength(AUTH_CONST.PASSWORD.MIN_LENGTH)
  @MaxLength(AUTH_CONST.PASSWORD.MAX_LENGTH)
  newPassword: string;
}
