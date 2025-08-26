import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BOOLEAN_ENUM } from '@constant/app.enum';
import { BaseModel } from '@core/schema/base.model';

@Schema({
  timestamps: true,
  collection: 'contacts',
  collation: { locale: 'vi' },
})
export class Contact extends BaseModel {
  @Prop({
    type: String,
    required: false,
  })
  email: string;

  @Prop({
    type: String,
    required: false,
  })
  fullname: string;

  @Prop({
    type: String,
    required: false,
  })
  phone: string;

  @Prop({
    type: String,
    required: true,
  })
  message: string;

  @Prop({
    type: String,
    required: false,
  })
  response: string;

  @Prop({
    type: Number,
    enum: BOOLEAN_ENUM,
    default: BOOLEAN_ENUM.FALSE,
  })
  isResponded: number;

  @Prop({
    type: Date,
    required: false,
  })
  respondedAt: Date;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  })
  respondedBy: string;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);

export type ContactDocument = Contact & mongoose.Document;
