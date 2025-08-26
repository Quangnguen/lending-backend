import { Document } from 'mongoose';
import { Prop } from '@nestjs/mongoose';

export class BaseModel extends Document {
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop()
  deletedAt?: Date;
}
