import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BaseResponseDto {
  @ApiProperty()
  @Expose({ name: '_id' })
  @Transform((value) => value.obj._id?.toString() || value.obj.id)
  id: string;

  @ApiProperty()
  @Expose({ name: 'code' })
  code: string;

  @ApiProperty()
  @Expose({ name: 'name' })
  name: string;

  @ApiProperty()
  @Expose({ name: 'createdAt' })
  createdAt: Date;

  @ApiProperty()
  @Expose({ name: 'updatedAt' })
  updatedAt: Date;
}

export class BaseSqlResponseDto {
  @Expose()
  @ApiProperty()
  id: number;

  @ApiPropertyOptional()
  @Expose()
  name?: string;

  @ApiPropertyOptional()
  @Expose()
  code?: string;
}
