import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type KycRecordDocument = KycRecord & Document;

export enum KYC_STEP_STATUS {
  NOT_STARTED = 'NOT_STARTED',
  ID_VERIFIED = 'ID_VERIFIED',
  FACE_VERIFIED = 'FACE_VERIFIED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

@Schema({ timestamps: true, collection: 'kyc_records' })
export class KycRecord {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User', unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(KYC_STEP_STATUS),
    default: KYC_STEP_STATUS.NOT_STARTED,
  })
  status: KYC_STEP_STATUS;

  @Prop({ type: Object })
  idInfo: {
    id?: string;           // Số CCCD/CMND — kiểm tra trùng lặp
    name?: string;
    dob?: string;
    sex?: string;
    nationality?: string;
    home?: string;
    address?: string;
    doe?: string;
    type?: string;
    features?: string;
    issue_date?: string;
    issue_loc?: string;
    confidence?: number;
  };

  @Prop({ type: Number })
  faceMatchScore: number;

  @Prop({ type: Date })
  completedAt: Date;

  @Prop({ type: String })
  rejectionReason: string;
}

export const KycRecordSchema = SchemaFactory.createForClass(KycRecord);

/**
 * Index thưa (sparse) trên trường idInfo.id:
 * - unique: mỗi số CCCD chỉ được ký kết bởi 1 tài khoản
 * - sparse: bỏ qua bản ghi chưa có trường này (KYC chưa bắt đầu)
 */
KycRecordSchema.index({ 'idInfo.id': 1 }, { unique: true, sparse: true });

