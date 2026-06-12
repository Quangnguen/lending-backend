import { isEmpty } from 'lodash';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Put, Get, Post, Body, Request, Controller } from '@nestjs/common';

import { AuthService } from './auth.service';
import { BaseDto } from '@core/dto/base.request.dto';
import { Public } from '@core/decorators/public.decorator';
import { UpdateMeRequestDto } from './dto/request/update-me.request.dto';
import { LoginUserRequestDto } from './dto/request/login-user.request.dto';
import { RegisterUserRequestDto } from './dto/request/register-user.request.dto';
import { ChangePasswordRequestDto } from './dto/request/change-password.request.dto';
import { RefreshTokenRequestDto } from '@components/auth/dto/request/refresh-token.request.dto';
import { ForgotPasswordRequestDto } from '@components/auth/dto/request/forgot-password.request.dto';
import { VerifyEmailRequestDto } from './dto/request/verify-email.request.dto';
import { ResendOtpRequestDto } from './dto/request/resend-otp.request.dto';
import { VerifyLoginOtpRequestDto } from './dto/request/verify-login-otp.request.dto';
import { LogoutRequestDto } from './dto/request/logout.request.dto';
import { ResetPasswordRequestDto } from './dto/request/reset-password.request.dto';

@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Chống spam tạo tài khoản
  @Post('/register')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Đăng ký mới người dùng',
    description: 'Đăng ký mới người dùng',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async register(@Body() payload: RegisterUserRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.register(request);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Chống brute-force mật khẩu
  @Post('/login')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Đăng nhập hệ thống',
    description: 'Đăng nhập hệ thống',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async login(@Body() payload: LoginUserRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.login(request);
  }

  @Post('/logout')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Đăng xuất',
    description: 'Đăng xuất khỏi thiết bị hiện tại hoặc tất cả thiết bị',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async logout(@Body() payload: LogoutRequestDto, @Request() req) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    request.user = req.user;

    // FIX HIGH-6: Truyền raw token để service blacklist vào Redis
    const authHeader = req.headers?.authorization as string | undefined;
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    return await this.authService.logout(request, rawToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Chống brute-force OTP
  @Post('/verify-login-otp')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Xác thực OTP đăng nhập',
    description: 'Xác thực OTP khi đăng nhập từ thiết bị không đáng tin cậy',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async verifyLoginOtp(@Body() payload: VerifyLoginOtpRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.verifyLoginOtp(request);
  }

  @Throttle({
    default: {
      limit: 300,
      ttl: 50_000,
    },
  }) // 300 requests per 50 seconds
  @Get('/me')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Thông tin cá nhân',
    description: 'Thông tin cá nhân',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  getMe(@Request() request: BaseDto) {
    return this.authService.getMe(request);
  }

  @Put('/me')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Cập nhật thông tin cá nhân',
    description: 'Cập nhật thông tin cá nhân',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async updateMe(@Body() payload: UpdateMeRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.updateMe(request);
  }

  /**
   * Cập nhật địa chỉ ví Ganache — endpoint riêng
   * Không yêu cầu các field khác (fullName, avatarUrl, gender)
   * Chỉ cần token hợp lệ
   */
  @Put('/me/wallet')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Cập nhật địa chỉ ví Ganache/Ethereum',
    description: 'Liên kết ví blockchain với tài khoản',
  })
  @ApiResponse({ status: 200, description: 'Success' })
  async updateWallet(@Request() req, @Body() body: { walletAddress: string }) {
    return await this.authService.updateWallet(req.user, body.walletAddress);
  }

  @Put('/change-password')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Thay đổi mật khẩu',
    description: 'Thay đổi mật khẩu',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async changePassword(@Body() payload: ChangePasswordRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.changePassword(request);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Chống spam email
  @Post('/forgot-password')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Forgot password',
    description: 'Forgot password',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async forgotPassword(@Body() payload: ForgotPasswordRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.forgotPassword(request);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('/reset-password')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Đặt lại mật khẩu bằng OTP',
    description:
      'Bước 2 của luồng quên mật khẩu: nhập OTP nhận qua email + mật khẩu mới',
  })
  @ApiResponse({ status: 200, description: 'Đặt lại mật khẩu thành công' })
  async resetPassword(@Body() payload: ResetPasswordRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.resetPassword(request);
  }

  @Public()
  @Post('/refresh-tokens')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Forgot password',
    description: 'Forgot password',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async refreshTokens(@Body() payload: RefreshTokenRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.refreshToken(request);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Chống brute-force OTP email
  @Post('/verify-email')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Xác thực email bằng OTP',
    description: 'Xác thực email bằng OTP sau đăng ký',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async verifyEmail(@Body() payload: VerifyEmailRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.verifyEmail(request);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Chỉ cho phép gửi lại 3 lần/phút
  @Post('/resend-otp')
  @ApiOperation({
    tags: ['Auth'],
    summary: 'Gửi lại mã OTP',
    description: 'Gửi lại mã OTP xác thực email',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  async resendOtp(@Body() payload: ResendOtpRequestDto) {
    const { request, responseError } = payload;

    if (!isEmpty(responseError)) {
      return responseError;
    }

    return await this.authService.resendOtp(request);
  }
}
