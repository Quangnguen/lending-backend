import { ApiProperty } from '@nestjs/swagger';

import { BaseDto } from '@core/dto/base.request.dto';

export class CreateFileRequestDto extends BaseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  fileUrl: string;

  @ApiProperty()
  fileType: string;

  @ApiProperty()
  fileSize: number;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  publicId: string;

  @ApiProperty()
  cloudProvider: string;
}
