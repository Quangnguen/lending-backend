import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatformEnum } from '../schemas/device-token.schema';

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'fcm-token-abc123' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ enum: DevicePlatformEnum, example: DevicePlatformEnum.ANDROID })
  @IsEnum(DevicePlatformEnum)
  platform: DevicePlatformEnum;

  @ApiPropertyOptional({ example: 'device-uuid-123' })
  @IsString()
  @IsOptional()
  deviceId?: string;
}
