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
  AUTH_CONST,
  KEY_PASSWORD_RESET,
  PASSWORD_RESET_EXPIRES,
} from './auth.constant';
import { SALT_ROUNDS_PASSWORD } from '@components/user/user.constant';
import {
  ROLE_ENUM,
  GENDER_ENUM,
  USER_STATUS_ENUM,
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
  ) {}

  async register(request: RegisterUserRequestDto) {
    const { email } = request;

    const emailExist = await this.userRepository.findOne({ email });
    if (!isEmpty(emailExist)) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_EXIST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const { fullname, password } = request;
    const newEntity = this.userRepository.createEntity({
      email,
      fullName: fullname,
      passwordHash: password,
      role: ROLE_ENUM.USER,
      gender: GENDER_ENUM.FEMALE,
    } as CreateUserRequestDto);

    await newEntity.save();

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.CREATED)
      .withMessage(this.i18n.translate('message.REGISTER_SUCCESS'))
      .build();
  }

  async login(request: LoginUserRequestDto) {
    const { email, password } = request;

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_OR_PASSWORD_INVALID'),
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

    return await this.buildDataLoginSuccess(user);
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

  async forgotPassword(request: ForgotPasswordRequestDto) {
    const { email } = request;

    const user = await this.userRepository.findOne({ email });
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_NOT_EXIST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const passwordReset = generateRandomString(
      AUTH_CONST.PASSWORD.LENGTH_DEFAULT,
    );

    this.logger.log(`PASSWORD RESET: ${passwordReset}`);

    const hashPassword = await bcrypt.hash(passwordReset, SALT_ROUNDS_PASSWORD);

    await this.cacheManager.set(
      `${KEY_PASSWORD_RESET}-${user._id.toString()}`,
      hashPassword,
      PASSWORD_RESET_EXPIRES,
    );

    const payloadSendEmail = {
      email,
      body: {
        template: MAIL_TEMPLATE_ENUM.FORGOT_PASSWORD,
        subject: this.i18n.translate('email.FORGOT_PASSWORD_SUBJECT'),
        context: {
          passwordReset,
        },
      },
    } as SendMailRequestDto;

    this.eventEmitter.emit(EVENT_ENUM.SEND_MAIL, payloadSendEmail);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.NEW_PASSWORD_SENT_TO_EMAIL'))
      .build();
  }

  private async buildDataLoginSuccess(user: User) {
    const authConfig = this.configService.get('auth', {
      infer: true,
    });

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

    const response = plainToInstance(
      LoginSuccessResponseDto,
      {
        user,
        accessToken,
        refreshToken,
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
}
