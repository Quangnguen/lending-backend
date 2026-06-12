import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  encrypt,
  encryptRandom,
  decrypt,
} from '../../core/utils/encryption.util';

export type KycRecordDocument = KycRecord & Document;

export enum KYC_STEP_STATUS {
  NOT_STARTED = 'NOT_STARTED',
  ID_VERIFIED = 'ID_VERIFIED',
  FACE_VERIFIED = 'FACE_VERIFIED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  REQUIRE_REVERIFY = 'REQUIRE_REVERIFY',
}

@Schema({ timestamps: true, collection: 'kyc_records' })
export class KycRecord {
  @Prop({
    type: Types.ObjectId,
    required: true,
    ref: 'User',
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(KYC_STEP_STATUS),
    default: KYC_STEP_STATUS.NOT_STARTED,
  })
  status: KYC_STEP_STATUS;

  @Prop({ type: Object })
  idInfo: {
    id?: string; // Số CCCD — encrypt() deterministic (cần tìm kiếm trùng lặp)
    name?: string; // Họ tên — encryptRandom()
    dob?: string; // Ngày sinh — encryptRandom()
    sex?: string; // Giới tính — encryptRandom()
    nationality?: string; // Quốc tịch — encryptRandom()
    home?: string; // Quê quán — encryptRandom()
    address?: string; // Địa chỉ thường trú — encryptRandom()
    doe?: string; // Ngày hết hạn — encryptRandom()
    type?: string; // Loại giấy tờ
    features?: string; // Đặc điểm nhận dạng — encryptRandom()
    issue_date?: string; // Ngày cấp — encryptRandom()
    issue_loc?: string; // Nơi cấp — encryptRandom()
    confidence?: number; // Độ tin cậy OCR (không nhạy cảm)
  };

  @Prop({ type: String })
  frontIdImageUrl: string;

  @Prop({ type: String })
  backIdImageUrl: string;

  @Prop({ type: String })
  selfieImageUrl: string;

  @Prop({ type: Number })
  faceMatchScore: number;

  // Hash nhận thức của ảnh selfie — dùng để phát hiện cùng khuôn mặt trên nhiều tài khoản
  @Prop({ type: String, sparse: true })
  selfieHash: string;

  @Prop({ type: Date })
  completedAt: Date;

  @Prop({ type: String })
  rejectionReason: string;

  @Prop({ type: String })
  reKycReason: string;

  @Prop({ type: Date })
  reKycRequestedAt: Date;

  @Prop({ type: String })
  reKycRequestedBy: string;
}

export const KycRecordSchema = SchemaFactory.createForClass(KycRecord);

// Index sparse trên số CCCD (sau khi encrypt — deterministic nên vẫn unique được)
KycRecordSchema.index({ 'idInfo.id': 1 }, { unique: true, sparse: true });

// Index để tìm duplicate selfie nhanh (không unique — cùng hash nhưng khác user cần throw ConflictException)
KycRecordSchema.index({ selfieHash: 1 }, { sparse: true });

// ─────────────────────────────────────────────────────────────────────────────
// Hàm helper: mã hóa tất cả field nhạy cảm trong idInfo
// STT-19: mã hóa thêm dob, sex, nationality, home, address, doe, features,
//         issue_date, issue_loc (trước đây chỉ có id và name)
// STT-20: dùng encryptRandom() cho các field không cần tìm kiếm exact-match
// ─────────────────────────────────────────────────────────────────────────────
function encryptIdInfo(info: Record<string, any>): void {
  if (!info) return;

  // encrypt() deterministic — cần cho tìm kiếm trùng số CCCD
  if (info.id) info.id = encrypt(info.id);

  // encryptRandom() — không cần exact-match search, bảo mật tốt hơn
  if (info.name) info.name = encryptRandom(info.name);
  if (info.dob) info.dob = encryptRandom(info.dob);
  if (info.sex) info.sex = encryptRandom(info.sex);
  if (info.nationality) info.nationality = encryptRandom(info.nationality);
  if (info.home) info.home = encryptRandom(info.home);
  if (info.address) info.address = encryptRandom(info.address);
  if (info.doe) info.doe = encryptRandom(info.doe);
  if (info.features) info.features = encryptRandom(info.features);
  if (info.issue_date) info.issue_date = encryptRandom(info.issue_date);
  if (info.issue_loc) info.issue_loc = encryptRandom(info.issue_loc);
  // type và confidence không phải PII — không cần mã hóa
}

function decryptIdInfo(info: Record<string, any>): void {
  if (!info) return;
  if (info.id) info.id = decrypt(info.id);
  if (info.name) info.name = decrypt(info.name);
  if (info.dob) info.dob = decrypt(info.dob);
  if (info.sex) info.sex = decrypt(info.sex);
  if (info.nationality) info.nationality = decrypt(info.nationality);
  if (info.home) info.home = decrypt(info.home);
  if (info.address) info.address = decrypt(info.address);
  if (info.doe) info.doe = decrypt(info.doe);
  if (info.features) info.features = decrypt(info.features);
  if (info.issue_date) info.issue_date = decrypt(info.issue_date);
  if (info.issue_loc) info.issue_loc = decrypt(info.issue_loc);
}

// Pre-save: mã hóa trước khi ghi vào MongoDB
KycRecordSchema.pre('save', function (next) {
  if (this.idInfo) {
    encryptIdInfo(this.idInfo as Record<string, any>);
  }
  next();
});

// Pre-findOneAndUpdate: mã hóa khi cập nhật qua update operators
KycRecordSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;

  if (update?.$set?.idInfo) {
    encryptIdInfo(update.$set.idInfo);
  } else if (update?.idInfo) {
    encryptIdInfo(update.idInfo);
  }

  next();
});

// Post-init: giải mã sau khi load từ MongoDB
KycRecordSchema.post('init', function (doc) {
  if (doc.idInfo) {
    decryptIdInfo(doc.idInfo as Record<string, any>);
  }
});
