import * as fs from 'fs';
import * as path from 'path';
import * as moment from 'moment';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

import { AllConfigType } from '@config/config.type';
import { RequestLoggingType } from '@components/types/request-logging.type';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private logDirectory: string;

  private logger = new Logger(RequestLoggingMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,

    private configService: ConfigService<AllConfigType>,
  ) {
    this.logDirectory = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl: url } = req;

    const startTime = Date.now();
    const userAgent = req.get('user-agent') || '';
    const requestTime = moment().format('YYYY-MM-DD HH:mm:ss.SSS');

    const ip =
      req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'anonymous';

    const authHeader = req.headers.authorization;
    const hasBearer = authHeader?.startsWith('Bearer ');

    const logInfo: RequestLoggingType = {
      timestamp: requestTime,
      method,
      url,
      ip,
      userAgent,
      hasBearer,
      email: 'anonymous',
    };

    if (hasBearer) {
      const token = authHeader.substring(7);
      try {
        const authConfig = this.configService.get('auth', {
          infer: true,
        });

        const payload = this.jwtService.verify(token, {
          secret: authConfig.accessSecret,
        });

        if (payload) {
          logInfo.email = payload.email || 'anonymous';
        }
      } catch (error) {
        logInfo.tokenError = error.name;
      }
    }

    // try {
    //   logInfo.payload = req.body ? JSON.stringify(req.body) : null;
    // } catch (error) {
    //   logInfo.payload = '[Cannot stringify payload]';
    // }

    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;

      const completeLogInfo: RequestLoggingType = {
        ...logInfo,
        statusCode,
        responseTime: `${responseTime}ms`,
      };

      this.logger.log(
        `[${method}] ${url} - Status: ${statusCode} - ${responseTime}ms - IP: ${ip} - ${hasBearer ? `User: ${logInfo.email}` : 'Unauthenticated'}`,
      );

      this.writeLogToFile(completeLogInfo);
    });

    next();
  }

  private writeLogToFile(logInfo: any): void {
    const today = moment().format('YYYY-MM-DD');
    const logFilePath = path.join(this.logDirectory, `request-${today}.log`);

    const logEntry = JSON.stringify(logInfo) + '\n';

    fs.appendFile(logFilePath, logEntry, (err) => {
      if (err) {
        this.logger.error(`Failed to write log to file: ${err.message}`);
      }
    });
  }
}
