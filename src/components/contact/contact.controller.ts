import {
  Get,
  Put,
  Body,
  Post,
  Param,
  Query,
  Delete,
  UseGuards,
  Controller,
} from '@nestjs/common';
import { isEmpty } from 'lodash';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { mergePayload } from '@utils/common';
import { ContactService } from './contact.service';
import { RoleGuard } from '@core/guards/role.guard';
import { Roles } from '@core/decorators/roles.decorator';
import { Public } from '@core/decorators/public.decorator';
import { IdParamDto } from '@core/dto/param-id.request.dto';
import { USER_ROLE_ENUM } from '@components/user/user.constant';
import { CreateContactRequestDto } from './dto/request/create-contact.request.dto';
import { GetListContactRequestDto } from './dto/request/get-list-contact.request.dto';
import { ResponseContactRequestDto } from './dto/request/response-contact.request.dto';
import { GetDetailContactRequestDto } from './dto/request/get-detail-contact.request.dto';

@ApiBearerAuth()
@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Get('/')
  @ApiOperation({
    tags: ['Contacts'],
    summary: 'Danh sách liên hệ',
    description: 'Danh sách liên hệ',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async list(@Query() query: GetListContactRequestDto) {
    const { request, responseError } = query;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.contactService.list(request);
  }

  @Public()
  @Post('/')
  @ApiOperation({
    tags: ['Contacts'],
    summary: 'Tạo mới liên hệ',
    description: 'Tạo mới liên hệ',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async create(@Body() payload: CreateContactRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.contactService.create(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Delete('/:id')
  @ApiOperation({
    tags: ['Contacts'],
    summary: 'Xóa thông tin liên hệ',
    description: 'Xóa thông tin liên hệ',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async delete(@Param() param: IdParamDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.contactService.delete(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Get('/:id')
  @ApiOperation({
    tags: ['Contacts'],
    summary: 'Chi tiết liên hệ',
    description: 'Chi tiết liên hệ',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async detail(@Param() param: GetDetailContactRequestDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.contactService.getDetail(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Put('/:id/response')
  @ApiOperation({
    tags: ['Contacts'],
    summary: 'Phản hồi liên hệ',
    description: 'Phản hồi liên hệ',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async response(
    @Param() param: IdParamDto,
    @Body() payload: ResponseContactRequestDto,
  ) {
    const { request, responseError } = mergePayload(payload, param);

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.contactService.response({ id: param.id, ...request });
  }
}
