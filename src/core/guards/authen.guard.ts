import {
  Scope,
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';

import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '@config/config.type';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { IS_PUBLIC_KEY, REQUEST_USER_KEY } from '@constant/app.enum';
import { BusinessException } from '@core/exception-filter/business-exception.filter';
import { UserRepositoryInterface } from '@database/repository/user/user.repository.interface';

export interface IJwtPayload {
  id: string;
  role?: number;
  email?: string;
  isAdmin?: boolean;
}

@Injectable({ scope: Scope.REQUEST })
export class AuthenGuard implements CanActivate {
  constructor(
    private reflector: Reflector,

    private readonly i18n: I18nService,

    private readonly jwtService: JwtService,

    private configService: ConfigService<AllConfigType>,

    @Inject('UserRepositoryInterface')
    private readonly userRepository: UserRepositoryInterface,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const authConfig = this.configService.get('auth', {
      infer: true,
    });

    let payload: IJwtPayload | null = null;

    try {
      payload = (await this.jwtService.verify(token, {
        secret: authConfig.accessSecret,
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

    if (!user) {
      throw new UnauthorizedException();
    }

    request['userId'] = user.id;
    request[REQUEST_USER_KEY] = user;

    if (request.body) {
      request.body.user = user;
      request.body.userId = user.id;
    }

    if (request.params) {
      request.params.user = user;
      request.params.userId = user.id;
    }

    if (request.query) {
      request.query.user = user;
      request.query.userId = user.id;
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
