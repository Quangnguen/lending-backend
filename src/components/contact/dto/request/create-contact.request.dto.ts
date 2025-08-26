import {
  IsEmail,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { BaseDto } from '@core/dto/base.request.dto';

export class CreateContactRequestDto extends BaseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  fullname: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  phone: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  message: string;
}
