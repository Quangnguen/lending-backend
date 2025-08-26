import * as dotenv from 'dotenv';

dotenv.config();

export class MailConfig {
  private readonly envConfig: { [key: string]: string | number } = null;

  constructor() {
    this.envConfig = {
      host: process.env.SEND_MAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.SEND_MAIL_PORT) || 465,
      username: process.env.SEND_MAIL_USERNAME,
      password: process.env.SEND_MAIL_PASSWORD,
      noReply: process.env.SEND_MAIL_NO_REPLY || 'support@maplife.com',
      tls: process.env.SEND_MAIL_TLS || 'SSLv3',
    };
  }

  get(key: string): any {
    return this.envConfig[key];
  }
}
