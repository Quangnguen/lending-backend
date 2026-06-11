import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as admin from 'firebase-admin';
import { DeviceToken, DeviceTokenDocument } from './schemas/device-token.schema';

export interface PushPayload {
  title: string;
  message: string;
  data?: Record<string, string>;
}

@Injectable()
export class FirebasePushService implements OnModuleInit {
  private readonly logger = new Logger(FirebasePushService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
  ) {}

  onModuleInit() {
    const projectId     = process.env.FIREBASE_PROJECT_ID;
    const clientEmail   = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey    = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase env vars missing — push notifications disabled');
      return;
    }

    if (admin.apps.length === 0) {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      this.firebaseApp = admin.app();
    }
    this.logger.log('Firebase Admin SDK initialised ✓');
  }

  // Gửi push đến tất cả active tokens của một user
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.firebaseApp) return;

    const tokens = await this.deviceTokenModel
      .find({ userId: new Types.ObjectId(userId), isActive: true })
      .lean();

    if (!tokens.length) return;

    const invalidTokens: string[] = [];

    await Promise.allSettled(
      tokens.map(async (t) => {
        try {
          await admin.messaging().send({
            token: t.token,
            notification: { title: payload.title, body: payload.message },
            data: payload.data ?? {},
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          });
        } catch (err: any) {
          // Token không còn hợp lệ → đánh dấu inactive
          if (
            err.code === 'messaging/registration-token-not-registered' ||
            err.code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(t.token);
          } else {
            this.logger.error(`FCM send error userId=${userId}: ${err.message}`);
          }
        }
      }),
    );

    if (invalidTokens.length) {
      await this.deviceTokenModel.updateMany(
        { token: { $in: invalidTokens } },
        { isActive: false },
      );
      this.logger.warn(`Deactivated ${invalidTokens.length} invalid FCM token(s) for userId=${userId}`);
    }
  }

  // Gửi push đến nhiều user
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.allSettled(userIds.map((id) => this.sendToUser(id, payload)));
  }

  // Đăng ký FCM token cho user
  async registerToken(userId: string, token: string, platform: string, deviceId?: string) {
    await this.deviceTokenModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), token },
      { userId: new Types.ObjectId(userId), token, platform, deviceId: deviceId ?? '', isActive: true },
      { upsert: true, new: true },
    );
  }

  // Xóa FCM token khi logout
  async removeToken(userId: string, token: string) {
    await this.deviceTokenModel.updateOne(
      { userId: new Types.ObjectId(userId), token },
      { isActive: false },
    );
  }
}
