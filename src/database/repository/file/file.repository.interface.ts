import { File as FileModel } from '@database/schemas/file.model';
import { BaseInterfaceRepository } from '@core/repository/base.interface.repository';
import { CreateFileRequestDto } from '@components/file/dto/request/create-file.request.dto';

export interface FileRepositoryInterface
  extends BaseInterfaceRepository<FileModel> {
  createEntity(data: CreateFileRequestDto): FileModel;
}
