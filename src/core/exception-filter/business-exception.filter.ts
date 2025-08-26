import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  ValidationError,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ResponseCodeEnum } from '@constant/response-code.enum';

export class BusinessException extends Error {
  public statusCode: ResponseCodeEnum;

  constructor(message: string, statusCode = ResponseCodeEnum.BAD_REQUEST) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class ValidationException extends Error {
  public errors: ValidationError[];
  constructor(validationErrors: ValidationError[] = []) {
    super('Validate Failed');
    this.errors = validationErrors;
  }
}

@Catch(BusinessException)
export class BusinessExceptionFilter implements ExceptionFilter {
  catch(exception: BusinessException, host: ArgumentsHost) {
    const { statusCode } = exception;
    const message = exception.message as any;
    if (host.getType() === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();
      response.status(statusCode).send({
        statusCode,
        message,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
