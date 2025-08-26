import {
  IsEnum,
  IsString,
  MaxLength,
  IsOptional,
  IsNotEmpty,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import {
  USER_ROLE_ENUM,
  USER_GENDER_ENUM,
} from '@components/user/user.constant';
import { BaseDto } from '@core/dto/base.request.dto';

export class UpdateUserRequestDto extends BaseDto {
  @IsOptional()
  @IsString()
  id: string;

  @ApiProperty({ description: 'fullname', example: 'kamil mysliwiec' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  fullname: string;

  @ApiProperty({ description: 'email', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ description: 'role', example: 1 })
  @IsNotEmpty()
  @IsEnum(USER_ROLE_ENUM)
  role: USER_ROLE_ENUM;

  @ApiProperty({ description: 'gender', example: 1 })
  @IsNotEmpty()
  @IsEnum(USER_GENDER_ENUM)
  gender: USER_GENDER_ENUM;

  @ApiProperty({ description: 'phone', example: '0123456789' })
  @Length(10)
  @IsString()
  @IsOptional()
  phone: string;
}
