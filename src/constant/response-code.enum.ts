import { ErrorMessageEnum } from './error-message.enum';

export enum ResponseCodeEnum {
  // 1xx - Informational
  CONTINUE = 100,
  SWITCHING_PROTOCOLS = 101,
  PROCESSING = 102,
  EARLY_HINTS = 103,

  // 2xx - Successful
  SUCCESS = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NON_AUTHORITATIVE_INFORMATION = 203,
  NO_CONTENT = 204,

  // 4xx - Client errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  INVALID_STATUS = 405,
  NOT_ACCEPTABLE = 406,
  TOO_MANY_REQUESTS = 429,

  // 5xx - Server errors
  INTERNAL_SERVER_ERROR = 500,

  // Custom business logic errors
  CODE_EXIST = 1001,
}

const CODE_MESSAGES = {
  NOT_FOUND: ErrorMessageEnum.NOT_FOUND,
  INTERNAL_SERVER_ERROR: ErrorMessageEnum.INTERNAL_SERVER_ERROR,
  UNAUTHORIZED: ErrorMessageEnum.UNAUTHORIZED,
  FORBIDDEN: ErrorMessageEnum.FORBIDDEN,
  BAD_REQUEST: ErrorMessageEnum.BAD_REQUEST,
  SUCCESS: ErrorMessageEnum.SUCCESS,
  CODE_EXIST: ErrorMessageEnum.CODE_EXIST,
  NOT_ACCEPTABLE: ErrorMessageEnum.NOT_ACCEPTABLE,
  TICKET_INVALID_STATUS: ErrorMessageEnum.INVALID_STATUS,
};

export const getMessage = (code: ResponseCodeEnum): string => {
  return CODE_MESSAGES[ResponseCodeEnum[code]];
};
