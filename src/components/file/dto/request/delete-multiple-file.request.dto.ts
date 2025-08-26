import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class DeleteMultipleFileRequestDto extends BaseDto {
  @ApiProperty()
  @ArrayUnique()
  @ArrayNotEmpty()
  @Type(() => String)
  @ArrayMaxSize(10)
  fileIds: string[];
}
