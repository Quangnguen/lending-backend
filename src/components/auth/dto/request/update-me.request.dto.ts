import {
  IsUrl,
  Length,
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
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

  // Địa chỉ ví Ethereum (Ganache/MetaMask)
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress phải là địa chỉ Ethereum hợp lệ (0x + 40 ký tự hex)',
  })
  walletAddress?: string;
}
