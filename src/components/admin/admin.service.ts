import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import {
  AdminAction,
  AdminActionDocument,
} from '@database/schemas/admin-action.model';
import {
  SystemConfig,
  SystemConfigDocument,
} from '@database/schemas/system-config.model';
import { User, UserDocument } from '@database/schemas/user.model';
import {
  LoanRequest,
  LoanRequestDocument,
} from '@database/schemas/bank-request.model';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import {
  LoanRepayment,
  LoanRepaymentDocument,
} from '@database/schemas/loan-repayment.model';
import {
  Notification,
  NotificationDocument,
} from '../notification/notification.schema';
import {
  ADMIN_TARGET_TYPE_ENUM,
  ROLE_ENUM,
  LOAN_STATUS_ENUM,
  LOAN_REQUEST_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(AdminAction.name)
    private adminActionModel: Model<AdminActionDocument>,
    @InjectModel(SystemConfig.name)
    private systemConfigModel: Model<SystemConfigDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(LoanRequest.name)
    private loanRequestModel: Model<LoanRequestDocument>,
    @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
    @InjectModel(LoanRepayment.name)
    private loanRepaymentModel: Model<LoanRepaymentDocument>,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  // ── AUDIT LOGS ──────────────────────────────────────────────────────────────

  async getAuditLogs(filters: {
    page?: number;
    limit?: number;
    action?: string;
    adminId?: string;
    from?: string;
    to?: string;
    targetType?: string;
  }) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Number(filters.limit) || 20);
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters.action) query.actionType = filters.action;
    if (filters.adminId && Types.ObjectId.isValid(filters.adminId)) {
      query.adminId = new Types.ObjectId(filters.adminId);
    }
    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = new Date(filters.from);
      if (filters.to) query.createdAt.$lte = new Date(filters.to);
    }

    const [data, total] = await Promise.all([
      this.adminActionModel
        .find(query)
        .populate('adminId', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.adminActionModel.countDocuments(query),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getAuditStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayActions = await this.adminActionModel
      .find({ createdAt: { $gte: startOfDay } })
      .lean();
    const byAction: Record<string, number> = {};
    todayActions.forEach((a) => {
      byAction[a.actionType] = (byAction[a.actionType] || 0) + 1;
    });
    return {
      totalToday: todayActions.length,
      loginCount: byAction['LOGIN'] || 0,
      approvalCount: byAction['APPROVE_LOAN'] || 0,
      rejectionCount: byAction['REJECT_LOAN'] || 0,
      settingsChangeCount: byAction['UPDATE_SETTINGS'] || 0,
      byAction,
    };
  }

  // ── DASHBOARD ALERTS ────────────────────────────────────────────────────────

  async getDashboardAlerts() {
    const [overdueCount, defaultedCount, pendingLoanCount] = await Promise.all([
      this.loanModel.countDocuments({ status: LOAN_STATUS_ENUM.OVERDUE }),
      this.loanModel.countDocuments({ status: LOAN_STATUS_ENUM.DEFAULTED }),
      this.loanRequestModel.countDocuments({
        status: LOAN_REQUEST_STATUS_ENUM.PENDING,
      }),
    ]);

    const alerts: any[] = [];

    if (overdueCount > 0) {
      alerts.push({
        type: 'OVERDUE_LOANS',
        severity: overdueCount > 10 ? 'HIGH' : 'MEDIUM',
        count: overdueCount,
        message: `${overdueCount} khoản vay đang quá hạn, có thể chuyển vỡ nợ`,
        link: '/admin/loans?status=overdue',
      });
    }
    if (defaultedCount > 0) {
      alerts.push({
        type: 'DEFAULTED_LOANS',
        severity: 'HIGH',
        count: defaultedCount,
        message: `${defaultedCount} khoản vay vỡ nợ cần xử lý thanh lý`,
        link: '/admin/loans?status=defaulted',
      });
    }
    if (pendingLoanCount > 0) {
      alerts.push({
        type: 'PENDING_LOANS',
        severity: 'LOW',
        count: pendingLoanCount,
        message: `${pendingLoanCount} yêu cầu vay đang chờ lender`,
        link: '/admin/cases',
      });
    }

    return { alerts, total: alerts.length };
  }

  // ── SYSTEM SETTINGS ─────────────────────────────────────────────────────────

  async getSystemSettings() {
    const configs = await this.systemConfigModel.find().lean();
    const result: Record<string, Record<string, any>> = {
      lending: {},
      fees: {},
      risk: {},
      integrations: {},
    };

    // Giá trị mặc định
    const defaults: Record<string, any> = {
      'lending.minLoanAmount': 100,
      'lending.maxLoanAmount': 50000,
      'lending.minInterestRate': 5,
      'lending.maxInterestRate': 36,
      'lending.minDurationDays': 7,
      'lending.maxDurationDays': 365,
      'lending.maxPendingRequestsPerUser': 3,
      'lending.requestExpiryDays': 7,
      'fees.platformFeePercent': 0.5,
      'fees.lateFeePerDay': 0.1,
      'fees.maxLateFeePercent': 10,
      'risk.minCreditScoreForLoan': 400,
      'risk.defaultCollateralRatio': 150,
      'risk.liquidationThresholdDays': 30,
      'risk.defaultPenaltyScore': 150,
      'risk.liquidationPenaltyScore': 200,
      'risk.maxLtvRatio': 80,
      'integrations.fptAiEnabled': true,
      'integrations.vietQrEnabled': true,
      'integrations.ethPriceOracleEnabled': true,
    };

    Object.entries(defaults).forEach(([key, val]) => {
      const dotIdx = key.indexOf('.');
      const cat = key.substring(0, dotIdx);
      const field = key.substring(dotIdx + 1);
      if (result[cat]) result[cat][field] = val;
    });

    // Override với giá trị từ DB
    configs.forEach((cfg) => {
      const dotIdx = cfg.key.indexOf('.');
      if (dotIdx === -1) return;
      const cat = cfg.key.substring(0, dotIdx);
      const field = cfg.key.substring(dotIdx + 1);
      if (!result[cat]) return;
      let parsed: any = cfg.value;
      try {
        if (cfg.valueType === 'number') parsed = parseFloat(cfg.value);
        else if (cfg.valueType === 'boolean') parsed = cfg.value === 'true';
        else if (cfg.valueType === 'json') parsed = JSON.parse(cfg.value);
      } catch {
        parsed = cfg.value;
      }
      result[cat][field] = parsed;
    });

    return result;
  }

  async updateSystemSettings(
    adminId: string,
    dto: UpdateSettingsDto,
    ipAddress?: string,
  ) {
    const updated: string[] = [];

    for (const [field, val] of Object.entries(dto.changes)) {
      const key = `${dto.category}.${field}`;
      const oldConfig = await this.systemConfigModel.findOne({ key }).lean();
      const valueStr =
        typeof val === 'object' ? JSON.stringify(val) : String(val);
      const valueType =
        typeof val === 'number'
          ? 'number'
          : typeof val === 'boolean'
            ? 'boolean'
            : typeof val === 'object'
              ? 'json'
              : 'string';

      await this.systemConfigModel.findOneAndUpdate(
        { key },
        {
          $set: {
            key,
            value: valueStr,
            valueType,
            updatedBy: new Types.ObjectId(adminId),
          },
        },
        { upsert: true, new: true },
      );

      await this.adminActionModel.create({
        adminId: new Types.ObjectId(adminId),
        actionType: 'UPDATE_SETTINGS',
        targetType: ADMIN_TARGET_TYPE_ENUM.SYSTEM,
        oldValue: { [field]: oldConfig?.value },
        newValue: { [field]: valueStr },
        reason: dto.reason || '',
        ipAddress: ipAddress || '',
      });
      updated.push(field);
    }

    this.logger.log(
      `[Admin] Settings updated by ${adminId}: ${updated.join(', ')}`,
    );
    return { success: true, updated, effectiveFrom: new Date() };
  }

  async getSettingsHistory(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.adminActionModel
        .find({ actionType: 'UPDATE_SETTINGS' })
        .populate('adminId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.adminActionModel.countDocuments({ actionType: 'UPDATE_SETTINGS' }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  // ── ADMIN LOAN REQUESTS ─────────────────────────────────────────────────────

  async getAdminLoanRequests(filters: {
    page?: number;
    limit?: number;
    status?: string;
    borrowerId?: string;
    minAmount?: number;
    maxAmount?: number;
  }) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Number(filters.limit) || 20);
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters.status) query.status = filters.status;
    if (filters.borrowerId && Types.ObjectId.isValid(filters.borrowerId)) {
      query.borrowerId = new Types.ObjectId(filters.borrowerId);
    }
    if (filters.minAmount || filters.maxAmount) {
      query.loanAmount = {};
      if (filters.minAmount) query.loanAmount.$gte = Number(filters.minAmount);
      if (filters.maxAmount) query.loanAmount.$lte = Number(filters.maxAmount);
    }

    const [data, total, statsArr] = await Promise.all([
      this.loanRequestModel
        .find(query)
        .populate('borrowerId', 'fullName email creditScore kycStatus')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.loanRequestModel.countDocuments(query),
      this.loanRequestModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const stats: Record<string, number> = {
      total: 0,
      pending: 0,
      funded: 0,
      expired: 0,
      cancelled: 0,
      rejected: 0,
    };
    statsArr.forEach((s) => {
      if (s._id) {
        stats[s._id] = s.count;
        stats.total += s.count;
      }
    });

    return { data, total, page, totalPages: Math.ceil(total / limit), stats };
  }

  async cancelLoanRequestByAdmin(
    adminId: string,
    requestId: string,
    reason: string,
  ) {
    const req = await this.loanRequestModel.findById(requestId);
    if (!req) throw new NotFoundException('Không tìm thấy yêu cầu vay');
    const cancellableStatuses = [
      LOAN_REQUEST_STATUS_ENUM.PENDING,
      LOAN_REQUEST_STATUS_ENUM.APPROVED,
    ];
    if (!cancellableStatuses.includes(req.status as any)) {
      throw new BadRequestException(
        `Chỉ có thể hủy yêu cầu ở trạng thái pending hoặc approved (hiện tại: ${req.status})`,
      );
    }
    const oldStatus = req.status;
    req.status = LOAN_REQUEST_STATUS_ENUM.CANCELLED as any;
    await req.save();

    await this.adminActionModel.create({
      adminId: new Types.ObjectId(adminId),
      actionType: 'CANCEL_LOAN_REQUEST',
      targetType: ADMIN_TARGET_TYPE_ENUM.LOAN,
      targetId: new Types.ObjectId(requestId),
      oldValue: { status: oldStatus },
      newValue: { status: LOAN_REQUEST_STATUS_ENUM.CANCELLED },
      reason,
    });

    return {
      success: true,
      requestId,
      status: LOAN_REQUEST_STATUS_ENUM.CANCELLED,
    };
  }

  // ── ADMIN LOANS ─────────────────────────────────────────────────────────────

  async getAdminLoans(filters: {
    page?: number;
    limit?: number;
    status?: string;
    borrowerId?: string;
  }) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Number(filters.limit) || 20);
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters.status) query.status = filters.status;
    if (filters.borrowerId && Types.ObjectId.isValid(filters.borrowerId)) {
      query.borrowerId = new Types.ObjectId(filters.borrowerId);
    }

    const [data, total, statsArr] = await Promise.all([
      this.loanModel
        .find(query)
        .populate('borrowerId', 'fullName email creditScore')
        .populate('lenderId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.loanModel.countDocuments(query),
      this.loanModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const stats: Record<string, number> = {
      total: 0,
      active: 0,
      repaid: 0,
      overdue: 0,
      defaulted: 0,
      liquidated: 0,
    };
    statsArr.forEach((s) => {
      if (s._id) {
        stats[s._id] = s.count;
        stats.total += s.count;
      }
    });

    return { data, total, page, totalPages: Math.ceil(total / limit), stats };
  }

  async getAdminLoanDetail(loanId: string) {
    const loan = await this.loanModel
      .findById(loanId)
      .populate(
        'borrowerId',
        'fullName email walletAddress creditScore reputationScore kycStatus',
      )
      .populate('lenderId', 'fullName email walletAddress')
      .lean();
    if (!loan) throw new NotFoundException('Không tìm thấy khoản vay');

    const repayments = await this.loanRepaymentModel
      .find({ loanId: new Types.ObjectId(loanId) })
      .sort({ createdAt: -1 })
      .lean();

    return { ...loan, repayments };
  }

  // ── COLLATERAL & LIQUIDATION ─────────────────────────────────────────────────

  async getCollateralAtRisk() {
    const loans = await this.loanModel
      .find({
        status: { $in: [LOAN_STATUS_ENUM.OVERDUE, LOAN_STATUS_ENUM.DEFAULTED] },
      })
      .populate('borrowerId', 'fullName email walletAddress')
      .lean();

    const data = loans.map((loan) => {
      const daysOverdue = loan.dueDate
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(loan.dueDate).getTime()) / 86400000,
            ),
          )
        : 0;
      return {
        loanId: loan._id,
        borrower: loan.borrowerId,
        loanContractAddress: loan.loanContractAddress,
        principalAmount: loan.principalAmount,
        status: loan.status,
        daysOverdue,
        daysUntilLiquidation: Math.max(0, 30 - daysOverdue),
        dueDate: loan.dueDate,
      };
    });

    return {
      data,
      summary: {
        totalAtRisk: data.length,
        totalPrincipalAtRisk: data.reduce(
          (sum, l) => sum + (Number(l.principalAmount) || 0),
          0,
        ),
      },
    };
  }

  async getLiquidationHistory() {
    const loans = await this.loanModel
      .find({ status: LOAN_STATUS_ENUM.LIQUIDATED })
      .populate('borrowerId', 'fullName email walletAddress')
      .populate('lenderId', 'fullName email')
      .sort({ updatedAt: -1 })
      .lean();
    return { data: loans, total: loans.length };
  }

  // ── NOTIFICATIONS BROADCAST ──────────────────────────────────────────────────

  async broadcastNotification(adminId: string, dto: BroadcastNotificationDto) {
    let userIds: string[] = [];

    if (dto.targetGroup === 'ALL') {
      const users = await this.userModel.find({}, '_id').lean();
      userIds = users.map((u) => u._id.toString());
    } else if (dto.targetGroup === 'BORROWERS') {
      const ids = await this.loanRequestModel.distinct('borrowerId');
      userIds = ids.map((id) => id.toString());
    } else if (dto.targetGroup === 'LENDERS') {
      const ids = await this.loanModel.distinct('lenderId', {
        lenderId: { $ne: null },
      });
      userIds = ids.map((id) => id.toString());
    } else if (dto.targetGroup === 'OVERDUE_BORROWERS') {
      const ids = await this.loanModel.distinct('borrowerId', {
        status: LOAN_STATUS_ENUM.OVERDUE,
      });
      userIds = ids.map((id) => id.toString());
    }

    userIds = [...new Set(userIds.filter(Boolean))];

    if (userIds.length > 0) {
      const notifications = userIds.map((userId) => ({
        userId: new Types.ObjectId(userId),
        title: dto.title,
        message: dto.message,
        type: dto.type || 'SYSTEM',
        isRead: false,
      }));
      await this.notificationModel.insertMany(notifications, {
        ordered: false,
      });
    }

    await this.adminActionModel.create({
      adminId: new Types.ObjectId(adminId),
      actionType: 'BROADCAST_NOTIFICATION',
      targetType: ADMIN_TARGET_TYPE_ENUM.SYSTEM,
      newValue: {
        title: dto.title,
        targetGroup: dto.targetGroup,
        recipientCount: userIds.length,
      },
    });

    this.logger.log(
      `[Admin] Broadcast "${dto.title}" → ${userIds.length} users by ${adminId}`,
    );
    return { success: true, recipientCount: userIds.length };
  }

  async getBroadcasts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.adminActionModel
        .find({ actionType: 'BROADCAST_NOTIFICATION' })
        .populate('adminId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.adminActionModel.countDocuments({
        actionType: 'BROADCAST_NOTIFICATION',
      }),
    ]);
    return { data, total };
  }

  // ── VERIFIERS ────────────────────────────────────────────────────────────────

  async createVerifier(
    adminId: string,
    dto: { fullName: string; email: string; password: string },
  ) {
    const existing = await this.userModel.findOne({ email: dto.email }).lean();
    if (existing) throw new BadRequestException('Email này đã được sử dụng');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verifier = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
      role: ROLE_ENUM.ADMIN,
      status: 'active',
      isVerified: false,
      kycStatus: 'not_started',
    });

    await this.adminActionModel.create({
      adminId: new Types.ObjectId(adminId),
      actionType: 'CREATE_VERIFIER',
      targetType: ADMIN_TARGET_TYPE_ENUM.USER,
      targetId: verifier._id,
      newValue: { email: dto.email, fullName: dto.fullName },
    });

    const verifierObj = verifier.toObject() as any;
    delete verifierObj.passwordHash;
    return { success: true, data: verifierObj };
  }

  async getVerifierStats(verifierId: string) {
    if (!Types.ObjectId.isValid(verifierId)) {
      throw new BadRequestException('ID không hợp lệ');
    }
    const actions = await this.adminActionModel
      .find({ adminId: new Types.ObjectId(verifierId) })
      .lean();
    return {
      totalActions: actions.length,
    };
  }
}
