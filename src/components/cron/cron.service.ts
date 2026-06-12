import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlockchainService } from '../blockchain/blockchain.service';
import { LoanService } from '../loan/loan.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly loanService: LoanService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async initCronJob() {
    this.logger.log(`INIT CRON JOB - Time: ${new Date()}`);
  }

  /**
   * Đồng bộ trạng thái khoản vay từ blockchain mỗi 5 phút.
   * Kiểm tra on-chain status và cập nhật MongoDB nếu có thay đổi.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncBlockchainLoans() {
    this.logger.log('🔄 [Cron] Bắt đầu đồng bộ blockchain...');
    try {
      const result = await this.blockchainService.syncAllActiveLoans();
      this.logger.log(
        `🔄 [Cron] Đồng bộ hoàn tất - Synced: ${result.synced}, Errors: ${result.errors}`,
      );
    } catch (error) {
      this.logger.error(`❌ [Cron] Lỗi đồng bộ blockchain: ${error.message}`);
    }
  }

  /**
   * Kiểm tra khoản vay quá hạn mỗi 30 phút.
   * Tự động chuyển status từ ACTIVE → OVERDUE nếu đã quá dueDate.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkOverdueLoans() {
    this.logger.log('⏰ [Cron] Kiểm tra khoản vay quá hạn...');
    try {
      const overdueCount = await this.blockchainService.checkOverdueLoans();
      if (overdueCount > 0) {
        this.logger.warn(
          `⚠️ [Cron] Phát hiện ${overdueCount} khoản vay quá hạn`,
        );
      }
    } catch (error) {
      this.logger.error(`❌ [Cron] Lỗi kiểm tra overdue: ${error.message}`);
    }
  }

  /**
   * Kiểm tra các yêu cầu vay đã quá hạn (PENDING > 7 ngày) mỗi 30 phút.
   * Tự động chuyển status từ PENDING -> EXPIRED.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkExpiredRequests() {
    this.logger.log('⏰ [Cron] Kiểm tra yêu cầu vay quá hạn...');
    try {
      const expiredCount = await this.loanService.checkExpiredRequests();
      if (expiredCount > 0) {
        this.logger.warn(
          `⚠️ [Cron] Phát hiện và hủy ${expiredCount} yêu cầu vay đã quá hạn`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ [Cron] Lỗi kiểm tra expired requests: ${error.message}`,
      );
    }
  }

  /**
   * Log blockchain status mỗi giờ (monitoring)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async logBlockchainHealth() {
    try {
      const stats = await this.blockchainService.getBlockchainStats();
      this.logger.log(
        `📊 [Cron] Blockchain Health: Connected=${stats.connected}, Block=${stats.blockNumber}, Listening=${stats.isListening}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [Cron] Blockchain health check failed: ${error.message}`,
      );
    }
  }
}
