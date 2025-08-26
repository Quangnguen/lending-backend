import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { File as FileModel } from '@database/schemas/file.model';
import { FileRepositoryInterface } from './file.repository.interface';
import { BaseAbstractRepository } from '@core/repository/base.abstract.repository';
import { CreateFileRequestDto } from '@components/file/dto/request/create-file.request.dto';
export class FileRepository
  extends BaseAbstractRepository<FileModel>
  implements FileRepositoryInterface
{
  constructor(
    @InjectModel('File')
    private readonly fileModel: Model<FileModel>,
  ) {
    super(fileModel);
  }

  createEntity(data: CreateFileRequestDto): FileModel {
    const entity = new this.fileModel();

    entity.user = data.userId;
    entity.fileUrl = data.fileUrl;
    entity.fileType = data.fileType;
    entity.fileSize = data.fileSize;
    entity.publicId = data.publicId;
    entity.originalName = data.originalName;
    entity.cloudProvider = data.cloudProvider;

    return entity;
  }
}
