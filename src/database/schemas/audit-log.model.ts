import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { BaseModel } from '@core/schema/base.model';

@Schema({
  timestamps: true,
  collection: 'audit_logs',
  collation: { locale: 'vi' },
})
export class AuditLog extends BaseModel {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: String, maxlength: 100 })
  action: string;

  @Prop({ type: String, maxlength: 50 })
  entityType: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  entityId: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  oldData: Record<string, any>;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  newData: Record<string, any>;

  @Prop({ type: String, maxlength: 45 })
  ipAddress: string;

  @Prop({ type: String })
  userAgent: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
export type AuditLogDocument = AuditLog & mongoose.Document;

// Indexes for common queries
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ createdAt: -1 });
