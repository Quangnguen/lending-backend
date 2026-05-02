import { Injectable, Logger } from '@nestjs/common';
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

  async saveIDResult(userId: string, idInfo: any) {
    // Lấy record cũ để merge nếu đã tồn tại
    const existingRecord = await this.kycRecordModel.findOne({ userId: new Types.ObjectId(userId) });
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

    this.logger.log(`KYC ID merged and saved for user ${userId}`);
    return record;
  }

  async saveFaceMatchResult(userId: string, similarity: number, isMatch: boolean) {
    const record = await this.kycRecordModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          faceMatchScore: similarity,
          status: isMatch ? KYC_STEP_STATUS.FACE_VERIFIED : KYC_STEP_STATUS.REJECTED,
          ...(isMatch ? {} : { rejectionReason: 'Khuôn mặt không khớp với ảnh trên giấy tờ' }),
        },
        $setOnInsert: { userId: new Types.ObjectId(userId) },
      },
      { upsert: true, new: true },
    );

    this.logger.log(`KYC Face match saved for user ${userId}: ${similarity}%`);
    return record;
  }

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
      // Trường hợp chưa có record, tạo mới với trạng thái COMPLETED
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
        }
      });
    } catch (e) {
      this.logger.error(`Failed to sync KYC status to User model: ${e.message}`);
    }

    this.logger.log(`KYC completed for user ${userId}`);

    return {
      success: true,
      message: 'Xác thực KYC thành công!',
      status: KYC_STEP_STATUS.COMPLETED,
    };
  }

  async getKYCStatus(userId: string) {
    const record = await this.kycRecordModel.findOne({
      userId: new Types.ObjectId(userId),
    }).lean();

    return {
      status: record?.status || KYC_STEP_STATUS.NOT_STARTED,
      idInfo: record?.idInfo || null,
      faceMatchScore: record?.faceMatchScore || null,
      completedAt: record?.completedAt || null,
    };
  }
}
