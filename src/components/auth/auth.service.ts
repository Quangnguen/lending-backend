import { isEmpty } from 'lodash';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';

import {
  KEY_FORGOT_OTP,
  FORGOT_OTP_EXPIRES,
  KEY_OTP_ATTEMPTS,
  KEY_OTP_LOCKED,
  MAX_OTP_ATTEMPTS,
  OTP_LOCKOUT_TTL,
} from './auth.constant';
import {
  ROLE_ENUM,
  GENDER_ENUM,
  USER_STATUS_ENUM,
  DEVICE_TYPE_ENUM,
} from '@constant/p2p-lending.enum';
import { EVENT_ENUM } from '@constant/event.enum';
import { AllConfigType } from '@config/config.type';
import { User } from '@database/schemas/user.model';
import { BaseDto } from '@core/dto/base.request.dto';
import { IJwtPayload } from '@core/guards/authen.guard';
import { ResponseBuilder } from '@utils/response-builder';
import { generateRandomString } from '@helpers/string.helper';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { MAIL_TEMPLATE_ENUM } from '@components/mail/mail.constant';
import { GetMeResponseDto } from './dto/response/get-me.response.dto';
import { UpdateMeRequestDto } from './dto/request/update-me.request.dto';
import { LoginUserRequestDto } from './dto/request/login-user.request.dto';
import { SendMailRequestDto } from '@components/mail/dto/send-mail.request.dto';
import { RegisterUserRequestDto } from './dto/request/register-user.request.dto';
import { LoginSuccessResponseDto } from './dto/response/login-success.response.dto';
import { BusinessException } from '@core/exception-filter/business-exception.filter';
import { ChangePasswordRequestDto } from './dto/request/change-password.request.dto';
import { CreateUserRequestDto } from '@components/user/dto/request/create-user.request.dto';
import { UserRepositoryInterface } from '@database/repository/user/user.repository.interface';
import { RefreshTokenRequestDto } from '@components/auth/dto/request/refresh-token.request.dto';
import { RefreshTokenResponseDto } from '@components/auth/dto/response/refresh-token.response.dto';
import { ForgotPasswordRequestDto } from '@components/auth/dto/request/forgot-password.request.dto';
import { ResetPasswordRequestDto } from '@components/auth/dto/request/reset-password.request.dto';
import { VerifyEmailRequestDto } from './dto/request/verify-email.request.dto';
import { ResendOtpRequestDto } from './dto/request/resend-otp.request.dto';
import { VerifyLoginOtpRequestDto } from './dto/request/verify-login-otp.request.dto';
import { UserSessionRepositoryInterface } from '@database/repository/user-session/user-session.repository.interface';
import { LogoutRequestDto } from './dto/request/logout.request.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,

    private jwtService: JwtService,

    private readonly i18n: I18nService,

    private readonly eventEmitter: EventEmitter2,

    private configService: ConfigService<AllConfigType>,

    @Inject('UserRepositoryInterface')
    private readonly userRepository: UserRepositoryInterface,

    @Inject('UserSessionRepositoryInterface')
    private readonly userSessionRepository: UserSessionRepositoryInterface,
  ) {}

  async register(request: RegisterUserRequestDto) {
    const { email, phoneNumber } = request;

    const emailExist = await this.userRepository.findOne({ email });
    if (!isEmpty(emailExist)) {
      if (emailExist.isVerified) {
        throw new BusinessException(
          this.i18n.translate('error.EMAIL_EXIST'),
          ResponseCodeEnum.BAD_REQUEST,
        );
      }
      // Chưa xác thực → xóa user cũ để cho đăng ký lại
      await this.userRepository.findByIdAndDelete(emailExist._id);
    }

    const phoneExist = await this.userRepository.findOne({
      phone: phoneNumber,
    });
    if (!isEmpty(phoneExist) && phoneExist.isVerified) {
      throw new BusinessException(
        this.i18n.translate('error.PHONE_EXIST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }
    if (!isEmpty(phoneExist) && !phoneExist.isVerified) {
      await this.userRepository.findByIdAndDelete(phoneExist._id);
    }

    const { fullname, password } = request;
    const newEntity = this.userRepository.createEntity({
      email,
      fullName: fullname,
      passwordHash: password,
      phone: phoneNumber,
      role: ROLE_ENUM.USER,
      gender: GENDER_ENUM.FEMALE,
      isVerified: false,
    } as CreateUserRequestDto);

    await newEntity.save();

    // Tạo OTP
    const otp = generateRandomString(6, 'numeric');
    const cacheKey = `otp:${email}`;
    await this.cacheManager.set(cacheKey, otp, 300000); // 5 phút
    this.logger.debug(`[DEV] OTP đăng ký cho ${email}: ${otp}`);

    // Gửi email
    this.eventEmitter.emit(EVENT_ENUM.SEND_MAIL, {
      email,
      body: {
        subject: 'Xác thực email đăng ký',
        template: 'verify-email.ejs',
        context: { otp },
      },
    } as SendMailRequestDto);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.CREATED)
      .withMessage(this.i18n.translate('message.REGISTER_SUCCESS_VERIFY_EMAIL')) // Cập nhật message
      .build();
  }

  async login(request: LoginUserRequestDto) {
    const { email, password, deviceId, deviceName, deviceType } = request;

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_OR_PASSWORD_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (
      !user.isVerified &&
      user.role !== ROLE_ENUM.ADMIN &&
      user.role !== ROLE_ENUM.SUPER_ADMIN
    ) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_NOT_VERIFIED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // Check if user is banned or suspended
    if (user.status === USER_STATUS_ENUM.BANNED) {
      throw new BusinessException(
        this.i18n.translate('error.ACCOUNT_IS_BANNED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (user.status === USER_STATUS_ENUM.SUSPENDED) {
      throw new BusinessException(
        this.i18n.translate('error.ACCOUNT_IS_SUSPENDED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_OR_PASSWORD_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // Bypass OTP cho đăng nhập từ Admin Portal (deviceType: web)
    // Admin portal đã có bảo vệ riêng qua NextAuth session
    if (deviceType === DEVICE_TYPE_ENUM.WEB) {
      this.logger.log(
        `Admin Portal bypass OTP for: ${email} (role: ${user.role})`,
      );
      return await this.buildDataLoginSuccess(user, {
        deviceId,
        deviceName,
        deviceType,
        isTrusted: true,
      });
    }

    // Check if device is trusted
    if (deviceId) {
      this.logger.log(
        `Checking trusted device for user: ${email}, deviceId: ${deviceId}`,
      );

      const trustedDevice = await this.userSessionRepository.findTrustedDevice(
        user._id,
        deviceId,
      );

      this.logger.log(`Trusted device found: ${trustedDevice ? 'YES' : 'NO'}`);

      if (trustedDevice) {
        // Trusted device - login directly
        this.logger.log(
          `Trusted device login for user: ${email}, deviceId: ${deviceId}`,
        );
        return await this.buildDataLoginSuccess(user, {
          deviceId,
          deviceName,
          deviceType,
          isTrusted: true,
        });
      }
    }

    // Not a trusted device - require OTP verification
    const otp = generateRandomString(6, 'numeric');
    const cacheKey = `login-otp:${email}`;
    await this.cacheManager.set(cacheKey, otp, 300000); // 5 minutes
    this.logger.debug(`[DEV] OTP đăng nhập cho ${email}: ${otp}`);

    // Send OTP email
    this.eventEmitter.emit(EVENT_ENUM.SEND_MAIL, {
      email,
      body: {
        subject: 'Mã xác thực đăng nhập',
        template: MAIL_TEMPLATE_ENUM.VERIFY_LOGIN,
        context: {
          otp,
          deviceName: deviceName || 'Unknown Device',
          deviceType: deviceType || 'Unknown',
        },
      },
    } as SendMailRequestDto);

    return new ResponseBuilder({
      requireOtp: true,
      email: email,
      message: 'Vui lòng nhập mã OTP đã gửi đến email của bạn',
    })
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.LOGIN_OTP_SENT'))
      .build();
  }

  getMe(request: BaseDto) {
    const response = plainToInstance(GetMeResponseDto, request.user, {
      excludeExtraneousValues: true,
    });
    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  async updateMe(request: UpdateMeRequestDto) {
    const { user } = request;

    const newMe = this.userRepository.updateMe(user, request);
    await newMe.save();

    const response = plainToInstance(GetMeResponseDto, newMe, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  async updateWallet(user: any, walletAddress: string) {
    // Validate format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      throw new BusinessException(
        'walletAddress phải là địa chỉ Ethereum hợp lệ',
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    await this.userRepository.updateWalletAddress(
      user._id.toString(),
      walletAddress,
    );
    this.logger.log(`Wallet updated for user ${user.email}: ${walletAddress}`);

    return new ResponseBuilder({ walletAddress })
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  async changePassword(request: ChangePasswordRequestDto) {
    const { user, oldPassword, newPassword } = request;

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new BusinessException(
        this.i18n.translate('error.OLD_PASSWORD_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    user.passwordHash = newPassword;
    await user.save();

    // STT-11 FIX: Blacklist tất cả active tokens sau khi đổi mật khẩu
    await this._blacklistAllUserTokens(user._id);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.CHANGE_PASSWORD_SUCCESS'))
      .build();
  }

  async refreshToken(request: RefreshTokenRequestDto) {
    const { refreshToken } = request;

    let payload: IJwtPayload | null = null;

    const authConfig = this.configService.get('auth', {
      infer: true,
    });

    const {
      accessSecret,
      accessExpires: accessTokenExpiresIn,
      refreshSecret,
      refreshExpires: refreshTokenExpiresIn,
    } = authConfig;

    try {
      payload = (await this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      })) as IJwtPayload;
    } catch (e) {
      switch (e.name) {
        case 'TokenExpiredError':
          throw new BusinessException(
            this.i18n.translate('error.TOKEN_EXPIRED'),
            ResponseCodeEnum.BAD_REQUEST,
          );
        case 'JsonWebTokenError':
          throw new BusinessException(
            this.i18n.translate('error.TOKEN_INVALID'),
            ResponseCodeEnum.BAD_REQUEST,
          );
        default:
          throw new BusinessException(
            this.i18n.translate('error.TOKEN_INVALID'),
            ResponseCodeEnum.BAD_REQUEST,
          );
      }
    }

    const { id } = payload;
    const user = await this.userRepository.findOne({ _id: id });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.TOKEN_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // STT-12 FIX: Kiểm tra refresh token có trong session active không
    const sessions = await this.userSessionRepository.getUserSessions(user._id);
    const activeSession = sessions.find(
      (s) => s.isActive && s.refreshToken === refreshToken,
    );
    if (!activeSession) {
      throw new BusinessException(
        this.i18n.translate('error.TOKEN_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const [accessToken, refreshTokenNew] = await Promise.all([
      this.jwtService.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          isAdmin: user.role === ROLE_ENUM.ADMIN,
        } as unknown as IJwtPayload,
        {
          secret: accessSecret,
          expiresIn: accessTokenExpiresIn,
        },
      ),
      this.jwtService.sign(
        {
          id: user.id,
          role: user.role,
          isAdmin: user.role === ROLE_ENUM.ADMIN,
        } as unknown as IJwtPayload,
        {
          secret: refreshSecret,
          expiresIn: refreshTokenExpiresIn,
        },
      ),
    ]);

    // STT-12 FIX: Token rotation — cập nhật session với token mới, invalidate token cũ
    await this.userSessionRepository.upsertSession(
      user._id,
      { deviceId: activeSession.deviceId },
      { accessToken, refreshToken: refreshTokenNew },
      { isTrusted: activeSession.isTrusted },
    );

    const response = plainToInstance(
      RefreshTokenResponseDto,
      {
        accessToken,
        refreshToken: refreshTokenNew,
      },
      {
        excludeExtraneousValues: true,
      },
    );

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  // Thêm vào auth.service.ts

  // FIX HIGH-6: Nhận accessToken để blacklist — token không dùng được ngay sau logout.
  async logout(request: LogoutRequestDto, accessToken?: string) {
    const { user, deviceId, logoutAll } = request;

    if (!user) {
      throw new BusinessException(
        this.i18n.translate('error.UNAUTHORIZED'),
        ResponseCodeEnum.UNAUTHORIZED,
      );
    }

    try {
      if (logoutAll) {
        const count = await this.userSessionRepository.deactivateAllSessions(
          user._id,
        );
        this.logger.log(
          `User ${user.email} logged out from all ${count} devices`,
        );
      } else if (deviceId) {
        await this.userSessionRepository.deactivateSession(user._id, deviceId);
        this.logger.log(
          `User ${user.email} logged out from device: ${deviceId}`,
        );
      } else {
        this.logger.log(`User ${user.email} logged out`);
      }

      // FIX HIGH-6: Blacklist access token với TTL = thời gian còn lại của token.
      // Mọi request tiếp theo dùng token này sẽ bị AuthenGuard từ chối.
      if (accessToken) {
        try {
          const decoded = this.jwtService.decode(accessToken) as {
            exp?: number;
          } | null;
          const now = Math.floor(Date.now() / 1000);
          const remainingSeconds = decoded?.exp ? decoded.exp - now : 0;
          if (remainingSeconds > 0) {
            await this.cacheManager.set(
              `bl:${accessToken}`,
              '1',
              remainingSeconds * 1000, // cache-manager dùng ms
            );
          }
        } catch {
          // Non-blocking: nếu Redis lỗi, logout vẫn thành công
        }
      }

      return new ResponseBuilder()
        .withCode(ResponseCodeEnum.SUCCESS)
        .withMessage(this.i18n.translate('message.LOGOUT_SUCCESS'))
        .build();
    } catch (error) {
      this.logger.error(`Logout error for user ${user.email}:`, error);
      throw new BusinessException(
        this.i18n.translate('error.LOGOUT_FAILED'),
        ResponseCodeEnum.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async forgotPassword(request: ForgotPasswordRequestDto) {
    const { email } = request;

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_NOT_EXIST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // Tạo OTP 6 chữ số, hết hạn sau 15 phút
    const otp = generateRandomString(6, 'numeric');
    const cacheKey = `${KEY_FORGOT_OTP}:${email}`;
    await this.cacheManager.set(cacheKey, otp, FORGOT_OTP_EXPIRES);
    this.logger.debug(`[DEV] OTP quên mật khẩu cho ${email}: ${otp}`);

    this.eventEmitter.emit(EVENT_ENUM.SEND_MAIL, {
      email,
      body: {
        template: MAIL_TEMPLATE_ENUM.FORGOT_PASSWORD,
        subject: this.i18n.translate('email.FORGOT_PASSWORD_SUBJECT'),
        context: { otp },
      },
    } as SendMailRequestDto);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.FORGOT_PASSWORD_OTP_SENT'))
      .build();
  }

  async resetPassword(request: ResetPasswordRequestDto) {
    const { email, otp, newPassword } = request;

    // STT-15 FIX: Kiểm tra lockout trước khi xử lý OTP
    await this._checkOtpLock(email, 'reset-password');

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.USER_NOT_FOUND'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const cacheKey = `${KEY_FORGOT_OTP}:${email}`;
    const cachedOtp = await this.cacheManager.get<string>(cacheKey);

    if (!cachedOtp || cachedOtp !== otp) {
      // STT-15 FIX: Ghi nhận lần sai
      await this._recordOtpFailure(email, 'reset-password');
      throw new BusinessException(
        this.i18n.translate('error.INVALID_OTP'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // OTP đúng: xóa OTP và xóa attempt counter
    await this.cacheManager.del(cacheKey);
    await this._clearOtpAttempts(email, 'reset-password');

    user.passwordHash = newPassword;
    await user.save();

    // STT-11 FIX: Blacklist tất cả active tokens sau khi reset password
    await this._blacklistAllUserTokens(user._id);

    this.logger.log(`Password reset completed for ${email}`);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.RESET_PASSWORD_SUCCESS'))
      .build();
  }

  async verifyEmail(request: VerifyEmailRequestDto) {
    const { email, otp } = request;

    // STT-15 FIX: Kiểm tra lockout trước khi xử lý OTP
    await this._checkOtpLock(email, 'verify-email');

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.USER_NOT_FOUND'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (user.isVerified) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_ALREADY_VERIFIED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const cacheKey = `otp:${email}`;
    const cachedOtp = await this.cacheManager.get(cacheKey);
    if (!cachedOtp || cachedOtp !== otp) {
      // STT-15 FIX: Ghi nhận lần sai, lock sau MAX_OTP_ATTEMPTS
      await this._recordOtpFailure(email, 'verify-email');
      throw new BusinessException(
        this.i18n.translate('error.INVALID_OTP'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // OTP đúng: xóa OTP và xóa attempt counter
    await this.cacheManager.del(cacheKey);
    await this._clearOtpAttempts(email, 'verify-email');

    user.isVerified = true;
    await user.save();

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.EMAIL_VERIFIED_SUCCESS'))
      .build();
  }

  async resendOtp(request: ResendOtpRequestDto) {
    const { email } = request;

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.USER_NOT_FOUND'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (user.isVerified) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_ALREADY_VERIFIED'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // Tạo OTP mới
    const otp = generateRandomString(6, 'numeric');
    const cacheKey = `otp:${email}`;
    await this.cacheManager.set(cacheKey, otp, 300000); // 5 phút
    this.logger.debug(`[DEV] OTP gửi lại cho ${email}: ${otp}`);

    // Gửi email
    this.eventEmitter.emit(EVENT_ENUM.SEND_MAIL, {
      email,
      body: {
        subject: 'Mã OTP xác thực tài khoản',
        template: 'verify-email.ejs',
        context: { otp },
      },
    } as SendMailRequestDto);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.OTP_RESENT_SUCCESS'))
      .build();
  }

  async verifyLoginOtp(request: VerifyLoginOtpRequestDto) {
    const { email, otp, deviceId, deviceName, deviceType, trustDevice } =
      request;

    // STT-15 FIX: Kiểm tra lockout trước khi xử lý OTP
    await this._checkOtpLock(email, 'login-otp');

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.USER_NOT_FOUND'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const cacheKey = `login-otp:${email}`;
    const cachedOtp = await this.cacheManager.get(cacheKey);

    if (!cachedOtp || cachedOtp !== otp) {
      // STT-15 FIX: Ghi nhận lần sai
      await this._recordOtpFailure(email, 'login-otp');
      throw new BusinessException(
        this.i18n.translate('error.INVALID_OTP'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    // OTP đúng: xóa OTP và xóa attempt counter
    await this.cacheManager.del(cacheKey);
    await this._clearOtpAttempts(email, 'login-otp');

    this.logger.log(
      `Login OTP verified for ${email}, deviceId: ${deviceId}, trustDevice: ${trustDevice}`,
    );

    // Login success - create session with trust status
    return await this.buildDataLoginSuccess(user, {
      deviceId,
      deviceName,
      deviceType,
      isTrusted: trustDevice || false,
    });
  }

  private async buildDataLoginSuccess(
    user: User,
    deviceInfo?: {
      deviceId?: string;
      deviceName?: string;
      deviceType?: DEVICE_TYPE_ENUM;
      isTrusted?: boolean;
    },
  ) {
    const authConfig = this.configService.get('auth', { infer: true });

    const {
      accessSecret,
      accessExpires: accessTokenExpiresIn,
      refreshSecret,
      refreshExpires: refreshTokenExpiresIn,
    } = authConfig;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.sign(
        {
          id: user.id,
          role: user.role,
          email: user.email,
          isAdmin: user.role === ROLE_ENUM.ADMIN,
        } as unknown as IJwtPayload,
        {
          secret: accessSecret,
          expiresIn: accessTokenExpiresIn,
        },
      ),
      this.jwtService.sign(
        {
          id: user.id,
          role: user.role,
          isAdmin: user.role === ROLE_ENUM.ADMIN,
        } as unknown as IJwtPayload,
        {
          secret: refreshSecret,
          expiresIn: refreshTokenExpiresIn,
        },
      ),
    ]);

    // Save or update session if deviceId provided
    if (deviceInfo?.deviceId) {
      await this.saveUserSession(user, accessToken, refreshToken, deviceInfo);
    }

    const response = plainToInstance(
      LoginSuccessResponseDto,
      {
        user,
        accessToken,
        refreshToken,
        isTrustedDevice: deviceInfo?.isTrusted || false,
      },
      {
        excludeExtraneousValues: true,
      },
    );

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.LOGIN_SUCCESS'))
      .build();
  }

  // Helper method để lưu session
  private async saveUserSession(
    user: User,
    accessToken: string,
    refreshToken: string,
    deviceInfo: {
      deviceId?: string;
      deviceName?: string;
      deviceType?: DEVICE_TYPE_ENUM;
      isTrusted?: boolean;
    },
  ) {
    if (!deviceInfo?.deviceId) {
      this.logger.warn('No deviceId provided, skipping session save');
      return;
    }

    this.logger.log(
      `Saving session for user: ${user.email}, deviceId: ${deviceInfo.deviceId}, isTrusted: ${deviceInfo.isTrusted}`,
    );

    const session = await this.userSessionRepository.upsertSession(
      user._id,
      {
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
      },
      {
        accessToken,
        refreshToken,
      },
      {
        isTrusted: deviceInfo.isTrusted,
      },
    );

    this.logger.log(
      `Session saved: ${session._id}, isTrusted in DB: ${session.isTrusted}`,
    );
  }

  // STT-15: Kiểm tra xem email có đang bị khóa OTP không
  private async _checkOtpLock(email: string, scope: string): Promise<void> {
    const lockKey = `${KEY_OTP_LOCKED}:${scope}:${email}`;
    const isLocked = await this.cacheManager.get(lockKey);
    if (isLocked) {
      throw new BusinessException(
        this.i18n.translate('error.OTP_TOO_MANY_ATTEMPTS'),
        ResponseCodeEnum.TOO_MANY_REQUESTS,
      );
    }
  }

  // STT-15: Ghi nhận lần nhập OTP sai, khóa sau MAX_OTP_ATTEMPTS lần
  private async _recordOtpFailure(email: string, scope: string): Promise<void> {
    const attemptsKey = `${KEY_OTP_ATTEMPTS}:${scope}:${email}`;
    const lockKey = `${KEY_OTP_LOCKED}:${scope}:${email}`;

    const current = (await this.cacheManager.get<number>(attemptsKey)) ?? 0;
    const next = current + 1;

    if (next >= MAX_OTP_ATTEMPTS) {
      await this.cacheManager.set(lockKey, '1', OTP_LOCKOUT_TTL);
      await this.cacheManager.del(attemptsKey);
    } else {
      await this.cacheManager.set(attemptsKey, next, OTP_LOCKOUT_TTL);
    }
  }

  // STT-15: Xóa attempt counter sau khi OTP đúng
  private async _clearOtpAttempts(email: string, scope: string): Promise<void> {
    const attemptsKey = `${KEY_OTP_ATTEMPTS}:${scope}:${email}`;
    await this.cacheManager.del(attemptsKey);
  }

  // STT-11: Blacklist tất cả access token đang active của user (sau đổi/reset mật khẩu)
  private async _blacklistAllUserTokens(userId: any): Promise<void> {
    try {
      const sessions = await this.userSessionRepository.getUserSessions(userId);
      const now = Math.floor(Date.now() / 1000);

      await Promise.all(
        sessions
          .filter((s) => s.isActive && s.accessToken)
          .map(async (s) => {
            const decoded = this.jwtService.decode(s.accessToken) as {
              exp?: number;
            } | null;
            const remaining = decoded?.exp ? decoded.exp - now : 0;
            if (remaining > 0) {
              await this.cacheManager.set(
                `bl:${s.accessToken}`,
                '1',
                remaining * 1000,
              );
            }
          }),
      );
    } catch {
      // Non-blocking: không để blacklist lỗi ngăn đổi mật khẩu thành công
    }
  }
}
