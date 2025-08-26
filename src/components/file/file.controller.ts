import {
  Req,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Controller,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { isEmpty } from 'lodash';
import { I18nService } from 'nestjs-i18n';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';

import { FileService } from './file.service';
import { RoleGuard } from '@core/guards/role.guard';
import { BaseDto } from '@core/dto/base.request.dto';
import { Roles } from '@core/decorators/roles.decorator';
import { IdParamDto } from '@core/dto/param-id.request.dto';
import { FILE_CONST } from '@components/file/file.constant';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { USER_ROLE_ENUM } from '@components/user/user.constant';
import { BusinessException } from '@core/exception-filter/business-exception.filter';
import { DeleteMultipleFileRequestDto } from '@components/file/dto/request/delete-multiple-file.request.dto';

@ApiBearerAuth()
@Controller('files')
export class FileController {
  constructor(
    private readonly i18n: I18nService,

    private readonly fileService: FileService,
  ) {}

  private validateFile(file: Express.Multer.File) {
    if (file.size > FILE_CONST.MAX_FILE_SIZE_BYTE) {
      throw new BusinessException(
        this.i18n.translate('error.FILE_SIZE_INVALID', {
          args: { size: FILE_CONST.MAX_FILE_SIZE_MB },
        }),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (!FILE_CONST.VALID_MIME_TYPES.includes(file.mimetype)) {
      throw new BusinessException(
        this.i18n.translate('error.FILE_TYPE_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }
  }

  @Post('upload/single')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() request: BaseDto,
  ) {
    if (!file) {
      throw new BusinessException(
        this.i18n.translate('error.FILE_IS_REQUIRED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    this.validateFile(file);

    return this.fileService.uploadSingle(request, file);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadMultiple(
    @UploadedFiles()
    files: Express.Multer.File[],
    @Req() request: BaseDto,
  ) {
    if (isEmpty(files)) {
      throw new BusinessException(
        this.i18n.translate('error.FILE_IS_REQUIRED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (files.length > FILE_CONST.MAX_FILE_QUANTITY) {
      throw new BusinessException(
        this.i18n.translate('error.FILE_MAXIMUM_QUANTITY', {
          args: { max: FILE_CONST.MAX_FILE_QUANTITY },
        }),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    files.forEach((file) => this.validateFile(file));

    return await this.fileService.uploadMultiple(request, files);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Delete('/:id')
  @ApiOperation({
    tags: ['Category'],
    summary: 'Xóa thông tin file',
    description: 'Xóa thông tin file',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async deleteSingle(@Param() param: IdParamDto) {
    const { request, responseError } = param;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.fileService.deleteSingle(request);
  }

  @UseGuards(RoleGuard)
  @Roles(USER_ROLE_ENUM.ADMIN)
  @Delete('/delete-multiple')
  @ApiOperation({
    tags: ['File'],
    summary: 'Xóa thông tin nhiều file',
    description: 'Xóa thông tin nhiều file',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async deleteMultiple(@Body() payload: DeleteMultipleFileRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.fileService.deleteMultiple(request);
  }
}
