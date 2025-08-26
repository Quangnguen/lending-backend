import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional, IsNotEmpty } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class ResponseContactRequestDto extends BaseDto {
  @IsOptional()
  @IsString()
  id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  response: string;
}
