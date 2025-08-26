import { Module } from '@nestjs/common';

import { FileService } from './file.service';
import { FileController } from './file.controller';
import { FileProvider } from '@components/file/file.provider';

@Module({
  imports: [],
  controllers: [FileController],
  providers: [FileProvider, FileService],
  exports: [FileService],
})
export class FileModule {}
