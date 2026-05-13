import { Controller, Get, Put, Param, Request, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của tôi' })
  async getMyNotifications(
    @Request() req,
    @Query('limit') limit: string = '20',
    @Query('skip') skip: string = '0',
  ) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    return this.notificationService.getMyNotifications(userId, Number(limit), Number(skip));
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả là đã đọc' })
  async markAllAsRead(@Request() req) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    await this.notificationService.markAllAsRead(userId);
    return { success: true };
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user._id?.toString() || req.user.id?.toString();
    const result = await this.notificationService.markAsRead(userId, id);
    return { success: true, notification: result };
  }
}
