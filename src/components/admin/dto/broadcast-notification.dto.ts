import { IsString, IsNotEmpty, IsIn, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BroadcastNotificationDto {
  @ApiProperty({ description: 'Tiêu đề thông báo' })
  @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Nội dung thông báo' })
  @IsString() @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'Nhóm nhận thông báo',
    enum: ['ALL', 'BORROWERS', 'LENDERS', 'OVERDUE_BORROWERS'],
  })
  @IsIn(['ALL', 'BORROWERS', 'LENDERS', 'OVERDUE_BORROWERS'])
  targetGroup: 'ALL' | 'BORROWERS' | 'LENDERS' | 'OVERDUE_BORROWERS';

  @ApiPropertyOptional({
    description: 'Loại thông báo',
    enum: ['LOAN', 'SYSTEM', 'TRANSACTION'],
    default: 'SYSTEM',
  })
  @IsOptional() @IsIn(['LOAN', 'SYSTEM', 'TRANSACTION'])
  type?: 'LOAN' | 'SYSTEM' | 'TRANSACTION';

  @ApiPropertyOptional({ description: 'Thời điểm gửi (null = gửi ngay)' })
  @IsOptional() @IsDateString()
  scheduledAt?: string;
}
