import {
  IsEnum,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { GENDER_ENUM, ROLE_ENUM } from '@constant/p2p-lending.enum';
import { BaseDto } from '@core/dto/base.request.dto';

export class UpdateUserRequestDto extends BaseDto {
  @IsOptional()
  @IsString()
  id: string;

  @ApiProperty({ description: 'fullname', example: 'kamil mysliwiec' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  fullName: string;

  @ApiProperty({ description: 'email', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ description: 'role', example: 'user' })
  @IsNotEmpty()
  @IsEnum(ROLE_ENUM)
  role: ROLE_ENUM;

  @ApiProperty({ description: 'gender', example: 'male' })
  @IsNotEmpty()
  @IsEnum(GENDER_ENUM)
  gender: GENDER_ENUM;

  @ApiProperty({ description: 'phone', example: '0123456789' })
  @Length(10)
  @IsString()
  @IsOptional()
  phone: string;
}
