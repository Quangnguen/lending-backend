import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KycRecord, KycRecordDocument, KYC_STEP_STATUS } from '@database/schemas/kyc-record.model';
import { User, UserDocument } from '@database/schemas/user.model';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectModel(KycRecord.name)
    private kycRecordModel: Model<KycRecordDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Kiểm tra trùng số CCCD/CMND trên toàn hệ thống
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Đảm bảo mỗi số CCCD chỉ được đăng ký KYC thành công bởi MỘT tài khoản.
   * - Nếu số CCCD đã tồn tại trong bản ghi của user KHÁC → throw ConflictException.
   * - Nếu chính user này đang cập nhật lại → cho phép (re-submit).
   */
  private async checkDuplicateCCCD(
    cccdNumber: string,
    currentUserId: string,
  ): Promise<void> {
    if (!cccdNumber || cccdNumber.length < 9) return; // OCR không đọc được số → bỏ qua

    const existing = await this.kycRecordModel
      .findOne({
        'idInfo.id': cccdNumber,
        userId: { $ne: new Types.ObjectId(currentUserId) }, // Loại trừ chính user này
      })
      .select('userId status')
      .lean();

    if (existing) {
      this.logger.warn(
        `[KYC] ⛔ Duplicate CCCD: ${cccdNumber} — already used by userId: ${existing.userId}`,
      );
      throw new ConflictException(
        'Số Căn Cước Công Dân này đã được đăng ký bởi một tài khoản khác. ' +
          'Vui lòng liên hệ hỗ trợ nếu bạn cho rằng đây là nhầm lẫn.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bước 1: Lưu kết quả OCR (kèm kiểm tra trùng CCCD)
  // ─────────────────────────────────────────────────────────────────────────
  async saveIDResult(userId: string, idInfo: any) {
    // Kiểm tra trùng CCCD TRƯỚC khi lưu bất kỳ dữ liệu nào
    if (idInfo?.id) {
      await this.checkDuplicateCCCD(idInfo.id, userId);
    }

    // Merge thông tin OCR mới với bản ghi cũ (nếu có)
    const existingRecord = await this.kycRecordModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    const mergedIdInfo = {
      ...(existingRecord?.idInfo || {}),
      ...idInfo,
    };

    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          idInfo: mergedIdInfo,
          status: KYC_STEP_STATUS.ID_VERIFIED,
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true, new: true },
    );

    this.logger.log(`[KYC] ID result saved for user ${userId} — CCCD: ${idInfo?.id || 'N/A'}`);
    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bước 2: Lưu kết quả so khớp khuôn mặt
  // ─────────────────────────────────────────────────────────────────────────
  async saveFaceMatchResult(userId: string, similarity: number, isMatch: boolean) {
    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          faceMatchScore: similarity,
          status: isMatch ? KYC_STEP_STATUS.FACE_VERIFIED : KYC_STEP_STATUS.REJECTED,
          ...(isMatch
            ? {}
            : { rejectionReason: 'Khuôn mặt không khớp với ảnh trên giấy tờ' }),
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true, new: true },
    );

    this.logger.log(`[KYC] Face match saved for user ${userId}: ${similarity}%`);
    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bước 3: Hoàn tất KYC
  // ─────────────────────────────────────────────────────────────────────────
  async completeKYC(userId: string) {
    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          status: KYC_STEP_STATUS.COMPLETED,
          completedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!record) {
      await this.kycRecordModel.create({
        userId: new Types.ObjectId(userId),
        status: KYC_STEP_STATUS.COMPLETED,
        completedAt: new Date(),
      });
    }

    // Đồng bộ trạng thái vào bảng User
    try {
      await this.userModel.findByIdAndUpdate(userId, {
        $set: {
          kycStatus: 'verified',
          isVerified: true,
          kycVerifiedAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.error(`Failed to sync KYC status to User model: ${e.message}`);
    }

    this.logger.log(`[KYC] ✅ Completed for user ${userId}`);

    return {
      success: true,
      message: 'Xác thực KYC thành công!',
      status: KYC_STEP_STATUS.COMPLETED,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Query: Lấy trạng thái KYC
  // ─────────────────────────────────────────────────────────────────────────
  async getKYCStatus(userId: string) {
    const record = await this.kycRecordModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    return {
      status: record?.status || KYC_STEP_STATUS.NOT_STARTED,
      idInfo: record?.idInfo || null,
      faceMatchScore: record?.faceMatchScore || null,
      completedAt: record?.completedAt || null,
    };
  }
}
