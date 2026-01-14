import {
  ThrottlerGuard,
  ThrottlerStorage,
  ThrottlerException,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { Injectable, ExecutionContext } from '@nestjs/common';

import { REQUEST_USER_KEY } from '@constant/app.enum';
import { UserDocument } from '@database/schemas/user.model';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,

    storageService: ThrottlerStorage,

    reflector: Reflector,

    private readonly i18n: I18nService,
  ) {
    super(options, storageService, reflector);
  }

  // Override the default tracking logic
  protected getTracker(req: Record<string, any>): Promise<string> {
    // Use the user's ID for tracking if authenticated, else use the IP
    return req.user?.id || req.ip;
  }

  // Customize the rate-limit based on user roles
  protected getLimit(context: ExecutionContext): number {
    const request = context.switchToHttp().getRequest();
    const user = request[REQUEST_USER_KEY] as UserDocument;

    if (user?.role === ROLE_ENUM.ADMIN) {
      return 5; // Admins can make 5 requests in the TTL window
    } else {
      return 2; // Regular users get 2 requests
    }
  }

  // Set a global time-to-live of 60 seconds for all requests
  protected getTTL(): number {
    return 60;
  }

  // Override the throwThrottlingException method to use i18n
  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(this.i18n.t('error.TOO_MANY_REQUEST'));
  }
}
