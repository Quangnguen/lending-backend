import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

import { BaseResponseDto } from '@core/dto/base.response.dto';

export class GetDetailFileResponseDto extends BaseResponseDto {
  @ApiProperty()
  @Expose()
  originalName: string;

  @ApiProperty()
  @Expose()
  fileType: string;

  @ApiProperty()
  @Expose()
  fileSize: number;

  @ApiProperty()
  @Expose()
  fileUrl: string;
}
