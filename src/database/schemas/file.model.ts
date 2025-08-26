import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';

@Schema({
  timestamps: true,
  collection: 'files',
  collation: { locale: 'vi' },
})
export class File extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  })
  user: string;

  @Prop({
    type: String,
    required: false,
  })
  originalName: string;

  @Prop({
    type: String,
    required: false,
  })
  fileType: string;

  @Prop({
    type: Number,
    required: false,
  })
  fileSize: number;

  @Prop({
    type: String,
    required: false,
  })
  fileUrl: string;

  @Prop({
    type: String,
    required: false,
  })
  publicId: string;

  @Prop({
    type: String,
    required: false,
  })
  cloudProvider: string;
}

export const FileSchema = SchemaFactory.createForClass(File);

export type FileDocument = File & mongoose.Document;
