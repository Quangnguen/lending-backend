// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Multer } from 'multer';
import { isEmpty } from 'lodash';
import { Readable } from 'stream';
import { I18nService } from 'nestjs-i18n';
import { v2 as cloudinary } from 'cloudinary';
import { plainToInstance } from 'class-transformer';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { BaseDto } from '@core/dto/base.request.dto';
import { ResponseBuilder } from '@utils/response-builder';
import { IdParamDto } from '@core/dto/param-id.request.dto';
import { FILE_CONST } from '@components/file/file.constant';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { BusinessException } from '@core/exception-filter/business-exception.filter';
import { CreateFileRequestDto } from '@components/file/dto/request/create-file.request.dto';
import { FileRepositoryInterface } from '@database/repository/file/file.repository.interface';
import { GetDetailFileResponseDto } from '@components/file/dto/response/get-file-detail.response.dto';
import { DeleteMultipleFileRequestDto } from '@components/file/dto/request/delete-multiple-file.request.dto';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  constructor(
    private readonly i18n: I18nService,

    @Inject('FileRepositoryInterface')
    private readonly fileRepository: FileRepositoryInterface,
  ) {}

  private async uploadToCloudinary(
    file: Express.Multer.File,
  ): Promise<{ fileUrl: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: FILE_CONST.FOLDER_NAME,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            fileUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      const stream = Readable.from(file.buffer);
      stream.pipe(upload);
    });
  }

  private async deleteFromCloudinary(publicId: string): Promise<void> {
    return cloudinary.uploader.destroy(publicId);
  }

  private async uploadFile(file: Express.Multer.File): Promise<any> {
    return await this.uploadToCloudinary(file);
  }

  private async deleteFile(file: any): Promise<void> {
    return this.deleteFromCloudinary(file.publicId);
  }

  private createFileEntity(
    file: Express.Multer.File,
    uploadResult: any,
    userId: string,
    cloudProvider: string,
  ) {
    return this.fileRepository.createEntity({
      ...uploadResult,
      cloudProvider,
      fileSize: file.size,
      fileType: file.mimetype,
      user: userId,
      originalName: file.originalname,
    } as CreateFileRequestDto);
  }

  private buildSuccessResponse(
    data: any,
    code: ResponseCodeEnum,
    messageKey: string,
  ) {
    return new ResponseBuilder(data)
      .withCode(code)
      .withMessage(this.i18n.translate(messageKey))
      .build();
  }

  private buildErrorResponse(messageKey: string) {
    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.BAD_REQUEST)
      .withMessage(this.i18n.translate(messageKey))
      .build();
  }

  async uploadSingle(
    request: BaseDto,
    file: Express.Multer.File,
  ): Promise<any> {
    try {
      const result = await this.uploadToCloudinary(file);
      const userId = request?.user?.['_id'] as string;

      const entity = this.createFileEntity(file, result, userId, 'cloudinary');
      await entity.save();

      const response = plainToInstance(GetDetailFileResponseDto, entity, {
        excludeExtraneousValues: true,
      });

      return this.buildSuccessResponse(
        response,
        ResponseCodeEnum.CREATED,
        'message.UPLOAD_SUCCESS',
      );
    } catch (error) {
      this.logger.error(`UPLOAD FILE ERROR: ${error}`);
      return this.buildErrorResponse('error.UPLOAD_FAILED');
    }
  }

  async uploadMultiple(
    request: BaseDto,
    files: Express.Multer.File[],
  ): Promise<any> {
    const userId = request?.user?.['_id'] as string;

    try {
      const savedFiles = await Promise.all(
        files.map(async (file) => {
          const result = await this.uploadFile(file);
          const entity = this.createFileEntity(
            file,
            result,
            userId,
            'cloudinary',
          );
          return entity.save();
        }),
      );

      const response = plainToInstance(GetDetailFileResponseDto, savedFiles, {
        excludeExtraneousValues: true,
      });

      return this.buildSuccessResponse(
        response,
        ResponseCodeEnum.CREATED,
        'message.UPLOAD_SUCCESS',
      );
    } catch (error) {
      return this.buildErrorResponse('error.UPLOAD_FAILED');
    }
  }

  async deleteSingle(request: IdParamDto): Promise<any> {
    const { id } = request;

    const file = await this.fileRepository.findById(id);
    if (isEmpty(file)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    try {
      await Promise.all([
        this.deleteFile(file),
        this.fileRepository.deleteOne({ _id: id }),
      ]);

      return this.buildSuccessResponse(
        null,
        ResponseCodeEnum.SUCCESS,
        'message.DELETE_SUCCESS',
      );
    } catch (error) {
      return this.buildErrorResponse('error.DELETE_FAILED');
    }
  }

  async deleteMultiple(request: DeleteMultipleFileRequestDto): Promise<any> {
    const { fileIds } = request;

    const files = await this.fileRepository.find({
      _id: { $in: fileIds },
    });

    if (isEmpty(files) || files?.length !== fileIds?.length) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    try {
      await Promise.all([
        this.fileRepository.deleteMany({ _id: { $in: fileIds } }),
        ...files.map((file) => this.deleteFile(file)),
      ]);

      return this.buildSuccessResponse(
        null,
        ResponseCodeEnum.SUCCESS,
        'message.DELETE_SUCCESS',
      );
    } catch (error) {
      return this.buildErrorResponse('error.DELETE_FAILED');
    }
  }
}
