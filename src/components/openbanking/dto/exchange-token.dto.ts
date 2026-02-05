import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeTokenDto {
  @ApiProperty({ description: 'Public token from Plaid Link' })
  @IsNotEmpty()
  @IsString()
  publicToken: string;
}

export class ExchangeTokenResponseDto {
  @ApiProperty()
  connectionId: string;

  @ApiProperty()
  institutionName: string;

  @ApiProperty()
  accounts: Array<{
    accountId: string;
    name: string;
    type: string;
    subtype: string;
    mask: string;
  }>;
}
