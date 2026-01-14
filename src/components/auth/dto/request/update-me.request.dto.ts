import {
  IsUrl,
  Length,
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';
import { GENDER_ENUM } from '@constant/p2p-lending.enum';

export class UpdateMeRequestDto extends BaseDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  @IsUrl()
  avatarUrl: string;

  @Length(10)
  @IsString()
  @IsOptional()
  phone: string;

  @IsNotEmpty()
  @IsEnum(GENDER_ENUM)
  gender: GENDER_ENUM;
}
