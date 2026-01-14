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
import { ROLE_ENUM } from '@constant/p2p-lending.enum';
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
  @Roles(ROLE_ENUM.ADMIN)
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
  @Roles(ROLE_ENUM.ADMIN)
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
  @Roles(ROLE_ENUM.ADMIN)
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
  @Roles(ROLE_ENUM.ADMIN)
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
  @Roles(ROLE_ENUM.ADMIN)
  @Put('/:id/suspend')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Tạm ngưng tài khoản người dùng',
    description: 'Tạm ngưng tài khoản người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async suspend(@Param() param: IdParamDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.suspend(request);
  }

  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN)
  @Put('/:id/activate')
  @ApiOperation({
    tags: ['Users'],
    summary: 'Kích hoạt lại tài khoản người dùng',
    description: 'Kích hoạt lại tài khoản người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async activate(@Param() param: IdParamDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.activate(request);
  }

  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN)
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
  async getDetail(@Param() param: GetDetailUserRequestDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.userService.getDetail(request);
  }
}
