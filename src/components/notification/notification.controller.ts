import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { FirebasePushService } from './firebase-push.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { AdminSendNotificationDto } from './dto/admin-send-notification.dto';
import { Roles } from '@core/decorators/roles.decorator';
import { RoleGuard } from '@core/guards/role.guard';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: FirebasePushService,
  ) {}

  // ── User APIs ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của tôi' })
  async getMyNotifications(
    @Request() req,
    @Query('limit') limit = '20',
    @Query('skip') skip = '0',
  ) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    return this.notificationService.getMyNotifications(
      userId,
      Number(limit),
      Number(skip),
    );
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả là đã đọc' })
  async markAllAsRead(@Request() req) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    return this.notificationService.markAllAsRead(userId);
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    const result = await this.notificationService.markAsRead(userId, id);
    return { success: true, notification: result };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một thông báo (soft delete)' })
  async deleteNotification(@Request() req, @Param('id') id: string) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    await this.notificationService.softDelete(userId, id);
    return { success: true };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Đếm số thông báo chưa đọc' })
  async getUnreadCount(@Request() req) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    const count = await this.notificationService.countUnread(userId);
    return { count };
  }

  // ── FCM Device Token APIs ─────────────────────────────────────────────────

  @Post('device-token')
  @ApiOperation({ summary: 'Đăng ký FCM token (gọi sau khi đăng nhập)' })
  async registerDeviceToken(
    @Request() req,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    await this.pushService.registerToken(
      userId,
      dto.token,
      dto.platform,
      dto.deviceId,
    );
    return { success: true };
  }

  @Delete('device-token/:token')
  @ApiOperation({ summary: 'Xóa FCM token khi logout' })
  async removeDeviceToken(@Request() req, @Param('token') token: string) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    await this.pushService.removeToken(userId, token);
    return { success: true };
  }

  // ── Admin APIs ────────────────────────────────────────────────────────────

  @Post('admin/send')
  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN)
  @ApiOperation({ summary: '[Admin] Gửi thông báo đến user(s) hoặc tất cả' })
  async adminSendNotification(@Body() dto: AdminSendNotificationDto) {
    console.log(
      '>>> [CTRL] adminSendNotification hit, title:',
      dto?.title,
      'targetUserIds:',
      dto?.targetUserIds,
    );
    try {
      const result = await this.notificationService.sendAdminNotification({
        targetUserIds: dto.targetUserIds,
        title: dto.title,
        message: dto.message,
        metadata: dto.metadata,
      });
      console.log('>>> [CTRL] result:', JSON.stringify(result));
      return { success: true, ...result };
    } catch (err) {
      console.error(
        '>>> [CTRL] sendAdminNotification ERROR:',
        err?.message,
        err?.stack,
      );
      throw err;
    }
  }
}
