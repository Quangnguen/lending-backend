import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { encrypt, decrypt } from '../../core/utils/encryption.util';

export type KycRecordDocument = KycRecord & Document;

export enum KYC_STEP_STATUS {
  NOT_STARTED      = 'NOT_STARTED',
  ID_VERIFIED      = 'ID_VERIFIED',
  FACE_VERIFIED    = 'FACE_VERIFIED',
  COMPLETED        = 'COMPLETED',
  REJECTED         = 'REJECTED',
  REQUIRE_REVERIFY = 'REQUIRE_REVERIFY', // Admin yêu cầu xác minh lại
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

  // ── Ảnh giấy tờ (đường dẫn tương đối đến /uploads/kyc/) ─────────────────
  @Prop({ type: String })
  frontIdImageUrl: string;   // Mặt trước CCCD/CMND

  @Prop({ type: String })
  backIdImageUrl: string;    // Mặt sau CCCD/CMND

  @Prop({ type: String })
  selfieImageUrl: string;    // Ảnh selfie xác thực khuôn mặt

  // ── Face matching ─────────────────────────────────────────────────────────
  @Prop({ type: Number })
  faceMatchScore: number;

  // ── Trạng thái ────────────────────────────────────────────────────────────
  @Prop({ type: Date })
  completedAt: Date;

  @Prop({ type: String })
  rejectionReason: string;

  // ── Re-KYC (Admin yêu cầu xác minh lại) ──────────────────────────────────
  @Prop({ type: String })
  reKycReason: string;       // Lý do Admin yêu cầu xác minh lại

  @Prop({ type: Date })
  reKycRequestedAt: Date;    // Thời điểm yêu cầu Re-KYC

  @Prop({ type: String })
  reKycRequestedBy: string;  // Admin ID hoặc tên yêu cầu
}

export const KycRecordSchema = SchemaFactory.createForClass(KycRecord);

/**
 * Index thưa (sparse) trên trường idInfo.id:
 * - unique: mỗi số CCCD chỉ được ký kết bởi 1 tài khoản
 * - sparse: bỏ qua bản ghi chưa có trường này (KYC chưa bắt đầu)
 */
KycRecordSchema.index({ 'idInfo.id': 1 }, { unique: true, sparse: true });

KycRecordSchema.pre('save', function (next) {
  if (this.idInfo?.id) {
    this.idInfo.id = encrypt(this.idInfo.id);
  }
  if (this.idInfo?.name) {
    this.idInfo.name = encrypt(this.idInfo.name);
  }
  next();
});

KycRecordSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  
  if (update?.$set?.idInfo) {
    if (update.$set.idInfo.id) {
      update.$set.idInfo.id = encrypt(update.$set.idInfo.id);
    }
    if (update.$set.idInfo.name) {
      update.$set.idInfo.name = encrypt(update.$set.idInfo.name);
    }
  } else if (update?.idInfo) {
    if (update.idInfo.id) update.idInfo.id = encrypt(update.idInfo.id);
    if (update.idInfo.name) update.idInfo.name = encrypt(update.idInfo.name);
  }
  
  next();
});

KycRecordSchema.post('init', function (doc) {
  if (doc.idInfo?.id) {
    doc.idInfo.id = decrypt(doc.idInfo.id);
  }
  if (doc.idInfo?.name) {
    doc.idInfo.name = decrypt(doc.idInfo.name);
  }
});
