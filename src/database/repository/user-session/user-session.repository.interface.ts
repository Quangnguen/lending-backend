import { UserSession } from '@database/schemas/user-session.model';
import { BaseInterfaceRepository } from '@core/repository/base.interface.repository';
import { DEVICE_TYPE_ENUM } from '@constant/p2p-lending.enum';
import { Types } from 'mongoose';

export interface UserSessionRepositoryInterface
  extends BaseInterfaceRepository<UserSession> {
  // Find trusted device for user
  findTrustedDevice(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null>;

  // Get all sessions for a user
  getUserSessions(userId: Types.ObjectId | any): Promise<UserSession[]>;

  // Get all trusted devices for a user
  getTrustedDevices(userId: Types.ObjectId | any): Promise<UserSession[]>;

  // Create or update session
  upsertSession(
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
  ): Promise<UserSession>;

  // Mark device as trusted
  trustDevice(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null>;

  // Revoke device trust
  untrustDevice(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null>;

  // Deactivate session (logout)
  deactivateSession(
    userId: Types.ObjectId | any,
    deviceId: string,
  ): Promise<UserSession | null>;

  // Deactivate all sessions for a user
  deactivateAllSessions(userId: Types.ObjectId | any): Promise<number>;

  // Cleanup expired sessions
  cleanupExpiredSessions(): Promise<number>;
}
