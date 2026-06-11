import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KycRecord, KycRecordDocument, KYC_STEP_STATUS } from '@database/schemas/kyc-record.model';
import { User, UserDocument } from '@database/schemas/user.model';
import { encrypt, decrypt } from '@core/utils/encryption.util';
import { KycCloudinaryService } from './kyc-cloudinary.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectModel(KycRecord.name)
    private kycRecordModel: Model<KycRecordDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private kycCloudinaryService: KycCloudinaryService,
    private notificationService: NotificationService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Kiểm tra trùng số CCCD/CMND trên toàn hệ thống
  // ─────────────────────────────────────────────────────────────────────────
  async checkDuplicateCCCD(
    cccdNumber: string,
    currentUserId: string,
  ): Promise<void> {
    if (!cccdNumber || cccdNumber.length < 9) return;

    const encryptedCccd = encrypt(cccdNumber);

    // Query cả plaintext (record cũ) lẫn encrypted (record mới)
    // để tránh bỏ sót khi data được migrate hoặc tạo trước khi có hook mã hoá
    const existing = await this.kycRecordModel
      .findOne({
        $or: [
          { 'idInfo.id': cccdNumber },
          { 'idInfo.id': encryptedCccd },
        ],
        userId: { $ne: new Types.ObjectId(currentUserId) },
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
  // Bước 1: Lưu kết quả OCR + đường dẫn ảnh
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * @param userId - ID người dùng
   * @param idInfo - Kết quả OCR từ Tesseract
   * @param imageUrl - Đường dẫn ảnh đã lưu (relative URL)
   * @param imageType - 'front' | 'back'
   */
  async saveIDResult(
    userId: string,
    idInfo: any,
    imageUrl?: string,
    imageType?: 'front' | 'back',
  ) {
    // Kiểm tra trùng CCCD TRƯỚC khi lưu
    if (idInfo?.id) {
      await this.checkDuplicateCCCD(idInfo.id, userId);
    }

    // Merge thông tin OCR mới với bản ghi cũ
    const existingRecord = await this.kycRecordModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    const mergedIdInfo = {
      ...(existingRecord?.idInfo || {}),
      ...idInfo,
    };

    // Cập nhật field ảnh tương ứng
    const imageUpdate: Record<string, string> = {};
    if (imageUrl) {
      if (imageType === 'front') imageUpdate.frontIdImageUrl = imageUrl;
      else if (imageType === 'back') imageUpdate.backIdImageUrl = imageUrl;
    }

    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          idInfo: mergedIdInfo,
          status: KYC_STEP_STATUS.ID_VERIFIED,
          ...imageUpdate,
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `[KYC] ID result saved for user ${userId} — CCCD: ${idInfo?.id || 'N/A'} | imageType: ${imageType || 'none'}`,
    );
    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bước 2: Lưu kết quả so khớp khuôn mặt + ảnh selfie
  // ─────────────────────────────────────────────────────────────────────────
  async saveFaceMatchResult(
    userId: string,
    similarity: number,
    isMatch: boolean,
    selfieImageUrl?: string,
    selfieHash?: string,
  ) {
    // Kiểm tra khuôn mặt trùng lặp xuyên tài khoản (chỉ khi face match thành công)
    if (isMatch && selfieHash) {
      await this.checkDuplicateFace(selfieHash, userId);
    }

    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          faceMatchScore: similarity,
          status: isMatch ? KYC_STEP_STATUS.FACE_VERIFIED : KYC_STEP_STATUS.REJECTED,
          ...(selfieImageUrl ? { selfieImageUrl } : {}),
          ...(selfieHash && isMatch ? { selfieHash } : {}),
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
  // Kiểm tra khuôn mặt trùng lặp xuyên tài khoản (Hamming distance ≤ 8/64)
  // ─────────────────────────────────────────────────────────────────────────
  private async checkDuplicateFace(selfieHash: string, currentUserId: string): Promise<void> {
    if (!selfieHash || selfieHash.length < 16) return;

    // Lấy tất cả KYC records của user khác đã có selfieHash
    const others = await this.kycRecordModel
      .find({
        userId: { $ne: new Types.ObjectId(currentUserId) },
        selfieHash: { $exists: true, $ne: '' },
        status: { $in: [KYC_STEP_STATUS.FACE_VERIFIED, KYC_STEP_STATUS.COMPLETED] },
      })
      .select('userId selfieHash')
      .lean();

    const HAMMING_THRESHOLD = 8; // Tối đa 8/64 bit khác nhau = rất giống nhau
    for (const record of others) {
      const dist = this._hammingDistance(selfieHash, record.selfieHash as string);
      if (dist <= HAMMING_THRESHOLD) {
        this.logger.warn(
          `[KYC] ⛔ Duplicate face: user ${currentUserId} vs userId ${record.userId} (hamming=${dist})`,
        );
        throw new ConflictException(
          'Khuôn mặt này đã được đăng ký bởi một tài khoản khác. ' +
          'Mỗi người chỉ được tạo một tài khoản. Vui lòng liên hệ hỗ trợ nếu có nhầm lẫn.',
        );
      }
    }
  }

  private _hammingDistance(a: string, b: string): number {
    if (!a || !b || a.length !== b.length) return 64;
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (xor) { dist += xor & 1; xor >>= 1; }
    }
    return dist;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bước 3: Hoàn tất KYC
  // ─────────────────────────────────────────────────────────────────────────
  async completeKYC(userId: string) {
    // Re-check CCCD duplicate tại thời điểm hoàn tất (chặn bypass API)
    const pending = await this.kycRecordModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    // Yêu cầu phải có số CCCD hợp lệ mới được complete
    if (!pending?.idInfo?.id) {
      throw new ConflictException(
        'Không tìm thấy số CCCD/CMND trong hồ sơ. Vui lòng thực hiện lại bước xác thực giấy tờ.',
      );
    }

    // idInfo.id trong lean() là raw value — giải mã để lấy số thuần tuý
    const rawId = decrypt(pending.idInfo.id as string);
    if (!rawId || rawId.length < 9) {
      throw new ConflictException(
        'Số CCCD/CMND không hợp lệ. Vui lòng thực hiện lại bước xác thực giấy tờ.',
      );
    }
    await this.checkDuplicateCCCD(rawId, userId);

    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          status: KYC_STEP_STATUS.COMPLETED,
          completedAt: new Date(),
          // Xóa Re-KYC reason nếu hoàn thành lại thành công
          reKycReason: null,
          reKycRequestedAt: null,
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
    } catch (e: any) {
      this.logger.error(`Failed to sync KYC status to User model: ${e?.message}`);
    }

    this.logger.log(`[KYC] ✅ Completed for user ${userId}`);

    return {
      success: true,
      message: 'Xác thực KYC thành công!',
      status: KYC_STEP_STATUS.COMPLETED,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin: Yêu cầu người dùng xác minh lại (Re-KYC)
  // ─────────────────────────────────────────────────────────────────────────
  async requireReverify(userId: string, reason: string, adminId?: string) {
    // Kiểm tra user tồn tại
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng: ${userId}`);
    }

    // Cập nhật KycRecord
    await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          status: KYC_STEP_STATUS.REQUIRE_REVERIFY,
          reKycReason: reason,
          reKycRequestedAt: new Date(),
          reKycRequestedBy: adminId || 'admin',
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true, new: true },
    );

    // Cập nhật User model
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        kycStatus: 'require_reverify',
        isVerified: false,
      },
    });

    this.logger.log(
      `[KYC] 🔄 Re-KYC required for user ${userId} by admin ${adminId || '?'}: "${reason}"`,
    );

    return {
      success: true,
      message: `Đã yêu cầu người dùng xác minh lại KYC.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin: Lấy chi tiết KYC record đầy đủ (bao gồm ảnh)
  // ─────────────────────────────────────────────────────────────────────────
  async getKYCDetails(userId: string) {
    const record = await this.kycRecordModel
      .findOne({ userId: new Types.ObjectId(userId) });

    // BUG-3 FIX: ảnh được lưu với type 'authenticated' trên Cloudinary —
    // cần tạo signed URL mới mỗi lần truy cập thay vì trả raw URL
    const signedUrl = (type: 'id_front' | 'id_back' | 'selfie', exists: boolean) =>
      exists ? this.kycCloudinaryService.generateSignedUrl(userId, type) : null;

    return {
      status: record?.status || KYC_STEP_STATUS.NOT_STARTED,
      idInfo: record?.idInfo || null,
      faceMatchScore: record?.faceMatchScore || null,
      completedAt: record?.completedAt || null,
      frontIdImageUrl: signedUrl('id_front', !!record?.frontIdImageUrl),
      backIdImageUrl: signedUrl('id_back', !!record?.backIdImageUrl),
      selfieImageUrl: signedUrl('selfie', !!record?.selfieImageUrl),
      reKycReason: record?.reKycReason || null,
      reKycRequestedAt: record?.reKycRequestedAt || null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Query: Lấy trạng thái KYC (cho mobile app)
  // ─────────────────────────────────────────────────────────────────────────
  async getKYCStatus(userId: string) {
    const record = await this.kycRecordModel
      .findOne({ userId: new Types.ObjectId(userId) });

    return {
      status: record?.status || KYC_STEP_STATUS.NOT_STARTED,
      idInfo: record?.idInfo || null,
      faceMatchScore: record?.faceMatchScore || null,
      completedAt: record?.completedAt || null,
      reKycReason: record?.reKycReason || null,
    };
  }

}
