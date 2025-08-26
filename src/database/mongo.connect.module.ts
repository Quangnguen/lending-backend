import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { schemas } from './schemas';
import MongoConnectService from './mongo.connect.service';
import { UserRepository } from './repository/user/user.repository';
import { FileRepository } from '@database/repository/file/file.repository';
import { ContactRepository } from './repository/contact/contact.repository';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({ useClass: MongoConnectService }),
    MongooseModule.forFeature(schemas),
  ],
  providers: [
    {
      provide: 'FileRepositoryInterface',
      useClass: FileRepository,
    },
    {
      provide: 'UserRepositoryInterface',
      useClass: UserRepository,
    },
    {
      provide: 'ContactRepositoryInterface',
      useClass: ContactRepository,
    },
  ],
  exports: [
    {
      provide: 'FileRepositoryInterface',
      useClass: FileRepository,
    },
    {
      provide: 'UserRepositoryInterface',
      useClass: UserRepository,
    },
    {
      provide: 'ContactRepositoryInterface',
      useClass: ContactRepository,
    },
  ],
})
export class MongoConnectModule {}
