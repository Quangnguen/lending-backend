import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { BaseDto } from '@core/dto/base.request.dto';

export class ResendOtpRequestDto extends BaseDto {
  @ApiProperty({ description: 'email', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  email: string;
}
