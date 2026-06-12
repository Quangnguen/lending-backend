import {
  IsString,
  IsIn,
  IsObject,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({
    description: 'Nhóm cấu hình',
    enum: ['lending', 'fees', 'risk', 'integrations'],
  })
  @IsIn(['lending', 'fees', 'risk', 'integrations'])
  category: string;

  @ApiProperty({ description: 'Các thay đổi dạng key-value' })
  @IsObject()
  @IsNotEmpty()
  changes: Record<string, any>;

  @ApiPropertyOptional({ description: 'Lý do thay đổi' })
  @IsOptional()
  @IsString()
  reason?: string;
}
