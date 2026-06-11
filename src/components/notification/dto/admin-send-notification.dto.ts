import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminSendNotificationDto {
  @ApiProperty({ example: 'Thông báo bảo trì hệ thống' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Hệ thống sẽ bảo trì vào lúc 2:00 AM ngày 01/07/2025' })
  @IsString()
  @IsNotEmpty()
  message: string;

  // Nếu null/undefined → gửi tất cả user
  @ApiPropertyOptional({ type: [String], example: ['userId1', 'userId2'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetUserIds?: string[];

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
