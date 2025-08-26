export class RequestLoggingType {
  timestamp: string | Date;

  method: string;

  url: string;

  ip: string | string[];

  userAgent: string;

  hasBearer?: boolean;

  email: string;

  statusCode?: number;

  responseTime?: string;

  tokenError?: string;
}
