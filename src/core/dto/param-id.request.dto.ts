import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

import { BaseDto } from './base.request.dto';

export class IdParamDto extends BaseDto {
  @ApiProperty()
  @IsMongoId()
  @IsNotEmpty()
  id: string;
}
