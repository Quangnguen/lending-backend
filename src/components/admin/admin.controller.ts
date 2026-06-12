import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { RoleGuard } from '@core/guards/role.guard';
import { Roles } from '@core/decorators/roles.decorator';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';

@ApiTags('Admin Management')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RoleGuard)
@Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── AUDIT LOGS ──────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: '[Admin] Danh sách audit logs' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'adminId', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  async getAuditLogs(@Query() query: any) {
    return this.adminService.getAuditLogs(query);
  }

  @Get('audit-logs/stats')
  @ApiOperation({ summary: '[Admin] Thống kê audit logs hôm nay' })
  async getAuditStats() {
    return this.adminService.getAuditStats();
  }

  // ── DASHBOARD ALERTS ─────────────────────────────────────────────────────────

  @Get('dashboard/alerts')
  @ApiOperation({ summary: '[Admin] Cảnh báo dashboard' })
  async getDashboardAlerts() {
    return this.adminService.getDashboardAlerts();
  }

  // ── SETTINGS ────────────────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: '[Admin] Lấy cấu hình hệ thống' })
  async getSettings() {
    return this.adminService.getSystemSettings();
  }

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Cập nhật cấu hình hệ thống' })
  async updateSettings(@Request() req, @Body() dto: UpdateSettingsDto) {
    const adminId = req.user?._id?.toString() || req.user?.id;
    const ip = req.headers?.['x-forwarded-for'] || req.ip || '';
    return this.adminService.updateSystemSettings(adminId, dto, ip);
  }

  @Get('settings/history')
  @ApiOperation({ summary: '[Admin] Lịch sử thay đổi cấu hình' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSettingsHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getSettingsHistory(
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ── LOAN REQUESTS ────────────────────────────────────────────────────────────

  @Get('loans/requests')
  @ApiOperation({ summary: '[Admin] Danh sách tất cả yêu cầu vay' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'borrowerId', required: false, type: String })
  @ApiQuery({ name: 'minAmount', required: false, type: Number })
  @ApiQuery({ name: 'maxAmount', required: false, type: Number })
  async getAdminLoanRequests(@Query() query: any) {
    return this.adminService.getAdminLoanRequests(query);
  }

  @Post('loans/requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Hủy yêu cầu vay (phát hiện gian lận)' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu vay' })
  async cancelLoanRequest(
    @Request() req,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason?.trim())
      throw new BadRequestException('Vui lòng nhập lý do hủy');
    const adminId = req.user?._id?.toString() || req.user?.id;
    return this.adminService.cancelLoanRequestByAdmin(
      adminId,
      id,
      reason.trim(),
    );
  }

  // ── LOANS ────────────────────────────────────────────────────────────────────

  @Get('loans/collateral-at-risk')
  @ApiOperation({ summary: '[Admin] Khoản vay có tài sản thế chấp nguy hiểm' })
  async getCollateralAtRisk() {
    return this.adminService.getCollateralAtRisk();
  }

  @Get('loans/liquidation-history')
  @ApiOperation({ summary: '[Admin] Lịch sử thanh lý tài sản' })
  async getLiquidationHistory() {
    return this.adminService.getLiquidationHistory();
  }

  @Get('loans')
  @ApiOperation({ summary: '[Admin] Danh sách tất cả khoản vay' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'borrowerId', required: false, type: String })
  async getAdminLoans(@Query() query: any) {
    return this.adminService.getAdminLoans(query);
  }

  @Get('loans/:loanId')
  @ApiOperation({ summary: '[Admin] Chi tiết khoản vay' })
  @ApiParam({ name: 'loanId', description: 'ID khoản vay' })
  async getAdminLoanDetail(@Param('loanId') loanId: string) {
    return this.adminService.getAdminLoanDetail(loanId);
  }

  // ── NOTIFICATIONS ────────────────────────────────────────────────────────────

  @Post('notifications/broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Gửi thông báo hàng loạt' })
  async broadcastNotification(
    @Request() req,
    @Body() dto: BroadcastNotificationDto,
  ) {
    const adminId = req.user?._id?.toString() || req.user?.id;
    return this.adminService.broadcastNotification(adminId, dto);
  }

  @Get('notifications/broadcasts')
  @ApiOperation({ summary: '[Admin] Lịch sử broadcast thông báo' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getBroadcasts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getBroadcasts(
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ── VERIFIERS ────────────────────────────────────────────────────────────────

  @Post('verifiers')
  @Roles(ROLE_ENUM.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[SuperAdmin] Tạo tài khoản Verifier' })
  async createVerifier(@Request() req, @Body() dto: any) {
    const adminId = req.user?._id?.toString() || req.user?.id;
    return this.adminService.createVerifier(adminId, dto);
  }

  @Get('verifiers/:id/stats')
  @ApiOperation({ summary: '[Admin] Thống kê hiệu suất Verifier' })
  @ApiParam({ name: 'id', description: 'ID Verifier' })
  async getVerifierStats(@Param('id') id: string) {
    return this.adminService.getVerifierStats(id);
  }
}
