import {
  IsUrl,
  IsEnum,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { GENDER_ENUM, ROLE_ENUM } from '@constant/p2p-lending.enum';
import { BaseDto } from '@core/dto/base.request.dto';

export class CreateUserRequestDto extends BaseDto {
  @ApiProperty({ description: 'fullname', example: 'kamil mysliwiec' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  fullName: string;

  @ApiProperty({ description: 'email', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ description: 'password', example: 'kamil@mysliwiec' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  passwordHash: string;

  @ApiProperty({ description: 'role', example: 'user' })
  @IsEnum(ROLE_ENUM)
  @IsOptional()
  role?: ROLE_ENUM;

  @ApiProperty({ description: 'gender', example: 'male' })
  @IsEnum(GENDER_ENUM)
  @IsOptional()
  gender?: GENDER_ENUM;

  @ApiProperty({ description: 'avatar', example: 'https://...' })
  @IsOptional()
  @IsString()
  @IsUrl()
  avatarUrl?: string;

  @ApiProperty({ description: 'phone', example: '0123456789' })
  @MaxLength(20)
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'dateOfBirth' })
  @IsOptional()
  dateOfBirth?: Date;

  @ApiProperty({ description: 'address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ description: 'country' })
  @IsOptional()
  @IsString()
  country?: string;

  // KYC
  @IsOptional()
  @IsString()
  idCardNumber?: string;

  @IsOptional()
  @IsString()
  idCardFrontUrl?: string;

  @IsOptional()
  @IsString()
  idCardBackUrl?: string;

  @IsOptional()
  @IsString()
  selfieUrl?: string;

  // Wallet
  @IsOptional()
  @IsString()
  walletAddress?: string;

  // Status
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'isVerified', example: false })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  // Reference
  @IsOptional()
  createdBy?: any;
}
