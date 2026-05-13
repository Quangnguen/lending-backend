import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './notification.schema';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
  ) {}

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: 'LOAN' | 'SYSTEM' | 'TRANSACTION' = 'SYSTEM',
    referenceId?: string,
  ) {
    const notification = new this.notificationModel({
      userId: new Types.ObjectId(userId),
      title,
      message,
      type,
      referenceId: referenceId ? new Types.ObjectId(referenceId) : undefined,
    });
    return notification.save();
  }

  async getMyNotifications(userId: string, limit: number = 20, skip: number = 0) {
    const notifications = await this.notificationModel
      .find({
        userId: new Types.ObjectId(userId),
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const unreadCount = await this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    });

    return { notifications, unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
      { isRead: true },
      { new: true },
    );
  }

  async markAllAsRead(userId: string) {
    return this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );
  }

  // Cronjob chạy mỗi ngày lúc 8:00 sáng để nhắc nợ
  @Cron('0 8 * * *')
  async handleCronCheckApproachingDeadlines() {
    this.logger.debug('Running CronJob: Check Approaching Loan Deadlines');
    const now = new Date();

    const activeLoans = await this.loanModel
      .find({
        status: LOAN_STATUS_ENUM.ACTIVE,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
      .exec();

    for (const loan of activeLoans) {
      if (!loan.dueDate) continue;

      const dueDate = new Date(loan.dueDate);
      const diffMs = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 3) {
        await this.createNotification(
          loan.borrowerId.toString(),
          '⚠️ Sắp đến hạn trả nợ',
          `Khoản vay của bạn sẽ đến hạn sau 3 ngày nữa. Vui lòng chuẩn bị số dư để tránh phí phạt.`,
          'LOAN',
          loan._id.toString(),
        );
      } else if (diffDays === 1) {
        await this.createNotification(
          loan.borrowerId.toString(),
          '🚨 Hạn trả nợ ngày mai!',
          `Khoản vay của bạn sẽ đến hạn vào ngày mai. Hãy thanh toán ngay để tránh bị phạt lãi quá hạn.`,
          'LOAN',
          loan._id.toString(),
        );
      } else if (diffDays < 0) {
        await this.createNotification(
          loan.borrowerId.toString(),
          '🔴 Khoản vay đã quá hạn!',
          `Khoản vay của bạn đã quá hạn ${Math.abs(diffDays)} ngày. Vui lòng thanh toán ngay để tránh bị xử lý tài sản thế chấp.`,
          'LOAN',
          loan._id.toString(),
        );
      }
    }

    this.logger.debug(`CronJob done. Processed ${activeLoans.length} active loans.`);
  }
}
