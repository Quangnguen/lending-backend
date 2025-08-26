import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsString, IsNotEmpty } from 'class-validator';

import { EnumSort } from '@utils/common';
import { BaseDto } from './base.request.dto';
import { isJson } from '@helpers/string.helper';

export class Sort {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  column: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsEnum(EnumSort)
  order: string;
}

export class Filter {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  column: string;

  @IsString()
  @ApiProperty()
  @IsNotEmpty()
  text: string;
}

export class PaginationQuery extends BaseDto {
  @Transform(({ value }) => (value ? Number(value) : 1))
  page: number = 1;

  @Transform(({ value }) => (value ? Number(value) : 10))
  limit: number = 10;

  keyword?: string;

  @Type(() => Filter)
  @Transform(({ value }) => {
    if (value instanceof Array) return value;

    if (value) value = value.replace(/\\/g, '');

    if (isJson(value)) return JSON.parse(value);
  })
  filter?: Filter[];

  @Type(() => Sort)
  @Transform(({ value }) => {
    if (value instanceof Array) return value;

    if (value) value = value.replace(/\\/g, '');

    if (isJson(value)) return JSON.parse(decodeURIComponent(value));
  })
  sort?: Sort[];

  @Transform(({ obj }) => {
    const page = obj.page !== undefined ? Number(obj.page) : 1;
    const limit = obj.limit !== undefined ? Number(obj.limit) : 10;
    return (page - 1) * limit;
  })
  skip: number = 0;

  @Transform(({ obj }) => {
    const limit = obj.limit !== undefined ? Number(obj.limit) : 10;
    return limit;
  })
  take: number = 10;
}
