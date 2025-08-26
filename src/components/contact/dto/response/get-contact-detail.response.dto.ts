import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';

import { BaseResponseDto } from '@core/dto/base.response.dto';

export class BaseInfoUserResponseDto {
  @ApiProperty()
  @Expose({ name: '_id' })
  @Transform((value) => value.obj._id?.toString() || value.obj.id)
  id: string;

  @ApiProperty()
  @Expose()
  fullname: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  phone: string;
}

export class GetContactDetailResponseDto extends BaseResponseDto {
  @ApiProperty()
  @Expose()
  fullname: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  phone: string;

  @ApiProperty()
  @Expose()
  message: string;

  @ApiProperty()
  @Expose()
  response: string;

  @ApiProperty()
  @Expose()
  isResponded: number;

  @ApiProperty()
  @Expose()
  respondedAt: Date;

  @ApiProperty()
  @Expose()
  @Type(() => BaseInfoUserResponseDto)
  respondedBy: BaseInfoUserResponseDto;
}
