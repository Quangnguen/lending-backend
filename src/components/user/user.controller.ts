import {
  Put,
  Get,
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

import { UserService } from './user.service';
import { mergePayload } from '@utils/common';
import { USER_ROLE_ENUM } from './user.constant';
import { RoleGuard } from '@core/guards/role.guard';
import { Roles } from '@core/decorators/roles.decorator';
import { IdParamDto } from '@core/dto/param-id.request.dto';
import { UpdateUserRequestDto } from './dto/request/update-user.request.dto';
import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
import { GetListUserRequestDto } from './dto/request/get-list-user.request.dto';
import { GetDetailUserRequestDto } from './dto/request/get-detail-user.request.dto';

@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Get('/')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Danh sách người dùng',
    description: 'Danh sách người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async list(@Query() query: GetListUserRequestDto) {
    const { request, responseError } = query;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.list(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Post('/')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Tạo mới người dùng',
    description: 'Tạo mới người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async create(@Body() payload: CreateUserRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.create(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Put('/:id')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Cập nhật thông tin người dùng',
    description: 'Cập nhật thông tin người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async update(
    @Param() param: IdParamDto,
    @Body() payload: UpdateUserRequestDto,
  ) {
    const { request, responseError } = mergePayload(payload, param);

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.update(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Delete('/:id')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Xóa thông tin người dùng',
    description: 'Xóa thông tin người dùng',
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

    return await this.userService.delete(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Put('/:id/lock')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Khóa tài khoản người dùng',
    description: 'Khóa tài khoản người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async lock(@Param() param: IdParamDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.lock(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Put('/:id/unlock')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Mở khóa tài khoản người dùng',
    description: 'Mở khóa tài khoản người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async unlock(@Param() param: IdParamDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.unlock(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Get('/:id')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Chi tiết người dùng',
    description: 'Chi tiết người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async detail(@Param() param: GetDetailUserRequestDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.getDetail(request);
  }
}
