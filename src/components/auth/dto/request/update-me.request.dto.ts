import {
  IsUrl,
  Length,
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';
import { USER_GENDER_ENUM } from '@components/user/user.constant';

export class UpdateMeRequestDto extends BaseDto {
  @IsNotEmpty()
  @IsString()
  fullname: string;

  @IsNotEmpty()
  @IsString()
  @IsUrl()
  avatar: string;

  @Length(10)
  @IsString()
  @IsOptional()
  phone: string;

  @IsNotEmpty()
  @IsEnum(USER_GENDER_ENUM)
  gender: USER_GENDER_ENUM;
}
