import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateLinkTokenDto {
  @ApiProperty({ description: 'Redirect URI after linking', required: false })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}

export class CreateLinkTokenResponseDto {
  @ApiProperty()
  linkToken: string;

  @ApiProperty()
  expiration: string;
}
