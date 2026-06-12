import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';

import { Notification, NotificationDocument } from './notification.schema';
import {
  DeviceToken,
  DeviceTokenDocument,
} from './schemas/device-token.schema';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationGateway } from './notification.gateway';
import { FirebasePushService } from './firebase-push.service';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { User, UserDocument } from '@database/schemas/user.model';
import { LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,

    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,

    @InjectModel(Loan.name)
    private readonly loanModel: Model<LoanDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly gateway: NotificationGateway,
    private readonly pushService: FirebasePushService,
  ) {}

  // ── Core: tạo notification + emit socket + push FCM ──────────────────────

  async createAndSend(
    userId: string,
    title: string,
    message: string,
    type: NotificationTypeEnum,
    metadata?: Record<string, any>,
    referenceId?: string,
  ): Promise<NotificationDocument> {
    const doc = await this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      title,
      message,
      type,
      metadata: metadata ?? {},
      referenceId: referenceId ? new Types.ObjectId(referenceId) : undefined,
    });

    // Realtime socket — không throw nếu lỗi
    try {
      this.gateway.sendToUser(userId, doc.toObject());
      const unread = await this.countUnread(userId);
      this.gateway.sendUnreadCount(userId, unread);
    } catch (e) {
      this.logger.warn(`Socket emit failed userId=${userId}: ${e.message}`);
    }

    // FCM push — không throw nếu lỗi
    try {
      await this.pushService.sendToUser(userId, {
        title,
        message,
        data: { type, referenceId: referenceId ?? '' },
      });
    } catch (e) {
      this.logger.warn(`FCM push failed userId=${userId}: ${e.message}`);
    }

    return doc;
  }

  // ── Loan-specific notification helpers ───────────────────────────────────

  async notifyLoanFunded(params: {
    borrowerId: string;
    lenderId: string;
    loanId: string;
    transactionHash?: string;
  }) {
    const { borrowerId, loanId, transactionHash } = params;
    const meta = {
      loanId,
      transactionHash,
      role: 'borrower',
      screen: 'LoanDetail',
    };
    await this.createAndSend(
      borrowerId,
      '💰 Khoản vay đã được cấp vốn',
      'Khoản vay của bạn đã được cấp vốn thành công. Tiền USDT đã được chuyển vào ví của bạn.',
      NotificationTypeEnum.LOAN_FUNDED,
      meta,
      loanId,
    );
  }

  async notifyLoanRepaid(params: {
    borrowerId: string;
    lenderId: string;
    loanId: string;
    transactionHash?: string;
  }) {
    const { lenderId, loanId, transactionHash } = params;
    const meta = {
      loanId,
      transactionHash,
      role: 'lender',
      screen: 'LoanDetail',
    };
    await this.createAndSend(
      lenderId,
      '✅ Khoản vay đã được thanh toán',
      'Người vay đã hoàn tất thanh toán khoản vay. Vốn + lãi đã được chuyển vào ví của bạn.',
      NotificationTypeEnum.LOAN_REPAID,
      meta,
      loanId,
    );
  }

  async notifyLoanDueSoon(params: {
    borrowerId: string;
    loanId: string;
    daysLeft: number;
    dueDate: Date;
  }) {
    const { borrowerId, loanId, daysLeft, dueDate } = params;

    // Chống gửi trùng: kiểm tra đã có notification cùng loanId + type + daysLeft chưa
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.notificationModel.findOne({
      userId: new Types.ObjectId(borrowerId),
      'metadata.loanId': loanId,
      'metadata.daysLeft': daysLeft,
      type: NotificationTypeEnum.LOAN_DUE_SOON,
      createdAt: { $gte: today },
    });
    if (existing) return;

    const dueDateStr = dueDate.toLocaleDateString('vi-VN');
    const title =
      daysLeft === 1
        ? '🚨 Hạn trả nợ là ngày mai!'
        : `⚠️ Còn ${daysLeft} ngày đến hạn trả nợ`;
    const message = `Khoản vay của bạn sẽ đến hạn vào ${dueDateStr}. Vui lòng chuẩn bị đủ số dư USDT để tránh bị phạt lãi.`;

    await this.createAndSend(
      borrowerId,
      title,
      message,
      NotificationTypeEnum.LOAN_DUE_SOON,
      {
        loanId,
        daysLeft,
        dueDate: dueDate.toISOString(),
        screen: 'LoanDetail',
      },
      loanId,
    );
  }

  async notifyLoanLiquidated(params: {
    borrowerId: string;
    lenderId?: string;
    loanId: string;
    transactionHash?: string;
  }) {
    const { borrowerId, lenderId, loanId, transactionHash } = params;
    const notifications = [
      this.createAndSend(
        borrowerId,
        '🔴 Tài sản thế chấp của bạn đã bị thanh lý',
        'Khoản vay của bạn đã bị thanh lý do quá hạn thanh toán. Tài sản thế chấp đã được xử lý.',
        NotificationTypeEnum.LOAN_LIQUIDATED,
        { loanId, transactionHash, role: 'borrower', screen: 'LoanDetail' },
        loanId,
      ),
    ];

    if (lenderId && lenderId !== borrowerId) {
      notifications.push(
        this.createAndSend(
          lenderId,
          '🔴 Khoản đầu tư đã được thanh lý',
          'Khoản vay bạn tài trợ đã bị thanh lý. Mở chi tiết khoản vay để xem kết quả xử lý tài sản thế chấp.',
          NotificationTypeEnum.LOAN_LIQUIDATED,
          { loanId, transactionHash, role: 'lender', screen: 'LoanDetail' },
          loanId,
        ),
      );
    }

    await Promise.all(notifications);
  }

  async sendAdminNotification(params: {
    targetUserIds?: string[];
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    const { targetUserIds, title, message, metadata } = params;

    let userIds: string[];
    if (!targetUserIds || targetUserIds.length === 0) {
      const users = await this.userModel.find({}, '_id').lean();
      userIds = users.map((u: any) => u._id.toString());
      this.logger.log(
        `[AdminNotify] Gửi đến ALL: tìm thấy ${userIds.length} user(s)`,
      );
    } else {
      userIds = targetUserIds;
      this.logger.log(
        `[AdminNotify] Gửi đến TARGETED: ${userIds.length} user(s)`,
      );
    }

    if (userIds.length === 0) {
      this.logger.warn('[AdminNotify] Không có user nào để gửi');
      return { sent: 0 };
    }

    const results = await Promise.allSettled(
      userIds.map((uid) =>
        this.notificationModel.create({
          userId: new Types.ObjectId(uid),
          title,
          message,
          type: NotificationTypeEnum.ADMIN_MESSAGE,
          metadata: metadata ?? {},
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(
      `[AdminNotify] Kết quả: ${succeeded} thành công, ${failed} thất bại`,
    );

    // Emit socket + unread count + FCM cho từng user
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const doc = (r as any).value;
        try {
          this.gateway.sendToUser(userIds[i], doc.toObject());
        } catch {}
        // Cập nhật badge chính xác từ DB (không dùng +1 vì có thể drift)
        this.countUnread(userIds[i])
          .then((count) => {
            try {
              this.gateway.sendUnreadCount(userIds[i], count);
            } catch {}
          })
          .catch(() => {});
        this.pushService
          .sendToUser(userIds[i], { title, message })
          .catch(() => {});
      }
    });

    return { sent: succeeded };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async getMyNotifications(userId: string, limit = 20, skip = 0) {
    const notDeletedFilter = {
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };
    const [notifications, unreadCount] = await Promise.all([
      this.notificationModel
        .find({ userId: new Types.ObjectId(userId), ...notDeletedFilter })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countUnread(userId),
    ]);

    const legacyLoanIds = notifications
      .filter(
        (notification: any) =>
          notification.type === NotificationTypeEnum.LOAN_LIQUIDATED &&
          !notification.metadata?.role &&
          notification.referenceId,
      )
      .map((notification: any) => notification.referenceId);

    if (legacyLoanIds.length > 0) {
      const loans = await this.loanModel
        .find({ _id: { $in: legacyLoanIds } }, 'borrowerId lenderId')
        .lean();
      const loansById = new Map(
        loans.map((loan: any) => [loan._id.toString(), loan]),
      );

      for (const notification of notifications as any[]) {
        if (
          notification.type !== NotificationTypeEnum.LOAN_LIQUIDATED ||
          notification.metadata?.role ||
          !notification.referenceId
        ) {
          continue;
        }

        const loan = loansById.get(notification.referenceId.toString()) as any;
        if (!loan) continue;

        const role =
          loan.borrowerId?.toString() === userId
            ? 'borrower'
            : loan.lenderId?.toString() === userId
              ? 'lender'
              : undefined;

        if (role) {
          notification.metadata = {
            ...(notification.metadata ?? {}),
            loanId: notification.referenceId.toString(),
            role,
            screen: 'LoanDetail',
          };
        }
      }
    }

    return { notifications, unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      { isRead: true },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );
    this.gateway.sendUnreadCount(userId, 0);
    return { success: true };
  }

  async softDelete(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      { deletedAt: new Date() },
      { new: true },
    );
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });
  }

  // Backward-compat dùng cho các service cũ
  async createNotification(
    userId: string,
    title: string,
    message: string,
    type = 'SYSTEM',
    referenceId?: string,
  ) {
    return this.createAndSend(
      userId,
      title,
      message,
      type as NotificationTypeEnum,
      {},
      referenceId,
    );
  }

  // ── Cron: nhắc nợ hàng ngày lúc 8:00 ────────────────────────────────────

  @Cron('0 8 * * *')
  async handleCronCheckApproachingDeadlines(): Promise<void> {
    this.logger.debug('CronJob: Check approaching loan deadlines');
    const now = new Date();

    const activeLoans = await this.loanModel
      .find({ status: LOAN_STATUS_ENUM.ACTIVE })
      .lean();
    let sent = 0;

    for (const loan of activeLoans) {
      if (!loan.dueDate || !loan.borrowerId) continue;

      const dueDate = new Date(loan.dueDate);
      const diffDays = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 3 || diffDays === 1) {
        await this.notifyLoanDueSoon({
          borrowerId: loan.borrowerId.toString(),
          loanId: loan._id.toString(),
          daysLeft: diffDays,
          dueDate,
        });
        sent++;
      } else if (diffDays < 0) {
        // Quá hạn — notify một lần/ngày (dùng dedup trong notifyLoanDueSoon)
        await this.notifyLoanDueSoon({
          borrowerId: loan.borrowerId.toString(),
          loanId: loan._id.toString(),
          daysLeft: diffDays,
          dueDate,
        });
        sent++;
      }
    }

    this.logger.debug(
      `CronJob done. Checked ${activeLoans.length} loans, sent ${sent} notifications.`,
    );
  }
}
