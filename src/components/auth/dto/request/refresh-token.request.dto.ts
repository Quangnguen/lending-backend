import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class RefreshTokenRequestDto extends BaseDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    required: true,
    name: 'refreshToken',
    example: 'refreshToken',
  })
  refreshToken: string;
}
