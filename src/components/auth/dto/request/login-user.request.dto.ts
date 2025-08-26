import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class LoginUserRequestDto extends BaseDto {
  @IsNotEmpty()
  @IsString()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
