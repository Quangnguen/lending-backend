import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { BaseResponseDto } from '@core/dto/base.response.dto';

export class RefreshTokenResponseDto extends BaseResponseDto {
  @ApiProperty()
  @Expose()
  accessToken: string;

  @ApiProperty()
  @Expose()
  refreshToken: string;
}
