import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class LogoutRequestDto extends BaseDto {
  @ApiProperty({
    description: 'Device ID to logout from specific device',
    example: 'abc123-device-id',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({
    description: 'Logout from all devices',
    example: false,
    required: false,
  })
  @IsOptional()
  logoutAll?: boolean;
}
