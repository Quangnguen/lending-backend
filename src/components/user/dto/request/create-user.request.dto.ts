import {
  IsUrl,
  IsEnum,
  Length,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import {
  USER_ROLE_ENUM,
  USER_GENDER_ENUM,
} from '@components/user/user.constant';
import { BaseDto } from '@core/dto/base.request.dto';

export class CreateUserRequestDto extends BaseDto {
  @ApiProperty({ description: 'fullname', example: 'kamil mysliwiec' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  fullname: string;

  @ApiProperty({ description: 'email', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ description: 'password', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  password: string;

  @ApiProperty({ description: 'role', example: 1 })
  @IsEnum(USER_ROLE_ENUM)
  @IsOptional()
  role?: USER_ROLE_ENUM;

  @ApiProperty({ description: 'gender', example: 1 })
  @IsEnum(USER_GENDER_ENUM)
  @IsOptional()
  gender?: USER_GENDER_ENUM;

  @ApiProperty({ description: 'avatar', example: 'https://...' })
  @IsOptional()
  @IsString()
  @IsUrl()
  avatar?: string;

  @ApiProperty({ description: 'phone', example: '0123456789' })
  @Length(10)
  @IsString()
  @IsOptional()
  phone?: string;
}
