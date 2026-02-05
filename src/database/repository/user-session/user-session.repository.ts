import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import { UserSession } from '@database/schemas/user-session.model';
import { UserSessionRepositoryInterface } from './user-session.repository.interface';
import { BaseAbstractRepository } from '@core/repository/base.abstract.repository';
import { DEVICE_TYPE_ENUM } from '@constant/p2p-lending.enum';

export class UserSessionRepository
  extends BaseAbstractRepository<UserSession>
  implements UserSessionRepositoryInterface
{
  constructor(
    @InjectModel('UserSession')
    private readonly userSessionModel: Model<UserSession>,
  ) {
    super(userSessionModel);
  }

  async findTrustedDevice(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null> {
    return this.userSessionModel
      .findOne({
        userId,
        deviceId,
        isTrusted: true,
        isActive: true,
      })
      .exec();
  }

  async getUserSessions(userId: Types.ObjectId | any): Promise<UserSession[]> {
    return this.userSessionModel
      .find({
        userId,
        isActive: true,
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async getTrustedDevices(
    userId: Types.ObjectId | any,
  ): Promise<UserSession[]> {
    return this.userSessionModel
      .find({
        userId,
        isTrusted: true,
        isActive: true,
      })
      .sort({ trustedAt: -1 })
      .exec();
  }

  async upsertSession(
    userId: Types.ObjectId | any,
    deviceInfo: {
      deviceId: string;
      deviceName?: string;
      deviceType?: DEVICE_TYPE_ENUM;
      ipAddress?: string;
      userAgent?: string;
    },
    tokens: {
      accessToken: string;
      refreshToken: string;
    },
    options?: {
      isTrusted?: boolean;
    },
  ): Promise<UserSession> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Session expires in 30 days

    // Determine if we should update trust status
    const shouldTrust = options?.isTrusted === true;

    const updateData: any = {
      userId,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      isActive: true,
    };

    // If user explicitly trusts device, set trust fields
    if (shouldTrust) {
      updateData.isTrusted = true;
      updateData.trustedAt = new Date();
    }

    // Log for debugging
    console.log('Upserting session:', {
      userId: userId?.toString(),
      deviceId: deviceInfo.deviceId,
      isTrusted: shouldTrust,
    });

    return this.userSessionModel
      .findOneAndUpdate(
        {
          userId,
          deviceId: deviceInfo.deviceId,
        },
        { $set: updateData },
        { upsert: true, new: true },
      )
      .exec();
  }

  async trustDevice(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null> {
    return this.userSessionModel
      .findOneAndUpdate(
        {
          userId,
          deviceId,
        },
        {
          $set: {
            isTrusted: true,
            trustedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
  }

  async untrustDevice(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null> {
    return this.userSessionModel
      .findOneAndUpdate(
        {
          userId,
          deviceId,
        },
        {
          $set: {
            isTrusted: false,
            trustedAt: null,
          },
        },
        { new: true },
      )
      .exec();
  }

  async deactivateSession(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null> {
    return this.userSessionModel
      .findOneAndUpdate(
        {
          userId,
          deviceId,
        },
        {
          $set: {
            isActive: false,
            accessToken: null,
            refreshToken: null,
          },
        },
        { new: true },
      )
      .exec();
  }

  async deactivateAllSessions(userId: Types.ObjectId | any): Promise<number> {
    const result = await this.userSessionModel
      .updateMany(
        { userId },
        {
          $set: {
            isActive: false,
            accessToken: null,
            refreshToken: null,
          },
        },
      )
      .exec();

    return result.modifiedCount;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.userSessionModel
      .deleteMany({
        expiresAt: { $lt: new Date() },
      })
      .exec();

    return result.deletedCount;
  }
}
