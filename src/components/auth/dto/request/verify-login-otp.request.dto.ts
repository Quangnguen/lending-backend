import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';
import { DEVICE_TYPE_ENUM } from '@constant/p2p-lending.enum';

export class VerifyLoginOtpRequestDto extends BaseDto {
  @ApiProperty({ description: 'Email', example: 'user@example.com' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ description: 'OTP code', example: '123456' })
  @IsNotEmpty()
  @IsString()
  otp: string;

  @ApiProperty({ description: 'Device ID', example: 'abc123-device-id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ description: 'Device name', example: 'iPhone 15 Pro' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiProperty({ description: 'Device type', enum: DEVICE_TYPE_ENUM })
  @IsOptional()
  @IsEnum(DEVICE_TYPE_ENUM)
  deviceType?: DEVICE_TYPE_ENUM;

  @ApiProperty({
    description: 'Trust this device for future logins',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
