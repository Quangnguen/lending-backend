import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class RegisterUserRequestDto extends BaseDto {
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

  @ApiProperty({
    description: 'Cloudflare Turnstile captcha token',
    example: '0x4AAAAAAACwfNP2_ohdKlgY',
    required: false,
  })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
