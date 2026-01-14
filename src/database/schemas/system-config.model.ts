import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { CONFIG_VALUE_TYPE_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'system_configs',
  collation: { locale: 'vi' },
})
export class SystemConfig extends BaseModel {
  @Prop({
    type: String,
    required: true,
    unique: true,
    maxlength: 100,
  })
  key: string;

  @Prop({ type: String })
  value: string;

  @Prop({
    type: String,
    enum: Object.values(CONFIG_VALUE_TYPE_ENUM),
  })
  valueType: CONFIG_VALUE_TYPE_ENUM;

  @Prop({ type: String })
  description: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  })
  updatedBy: mongoose.Types.ObjectId;
}

export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfig);
export type SystemConfigDocument = SystemConfig & mongoose.Document;
