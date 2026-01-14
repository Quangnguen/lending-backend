import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';
import { ADMIN_TARGET_TYPE_ENUM } from '@constant/p2p-lending.enum';

@Schema({
  timestamps: true,
  collection: 'admin_actions',
  collation: { locale: 'vi' },
})
export class AdminAction extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  adminId: mongoose.Types.ObjectId;

  @Prop({ type: String, required: true, maxlength: 50 })
  actionType: string;

  @Prop({
    type: String,
    enum: Object.values(ADMIN_TARGET_TYPE_ENUM),
  })
  targetType: ADMIN_TARGET_TYPE_ENUM;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  targetId: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  oldValue: Record<string, any>;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  newValue: Record<string, any>;

  @Prop({ type: String })
  reason: string;

  @Prop({ type: String, maxlength: 45 })
  ipAddress: string;
}

export const AdminActionSchema = SchemaFactory.createForClass(AdminAction);
export type AdminActionDocument = AdminAction & mongoose.Document;
