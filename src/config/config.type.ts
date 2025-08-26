export type AppConfig = {
  nodeEnv: string;
  name: string;
  workingDirectory: string;
  frontendDomain?: string;
  backendDomain: string;
  port: number;
  apiPrefix: string;
  fallbackLanguage: string;
  headerLanguage: string;
  ttl: number;
  urlInvite?: string;
  fontsDirectory?: string;
};

export type AppleConfig = {
  appAudience: string[];
};

export type AuthConfig = {
  accessSecret?: string;
  accessExpires?: string;
  refreshSecret?: string;
  refreshExpires?: string;
  captchaSecret?: string;
  captchaExpires?: number;
};

export type DatabaseConfig = {
  url?: string;
  type?: string;
  host?: string;
  port?: number;
  password?: string;
  name?: string;
  username?: string;
  logging?: boolean;
  synchronize?: boolean;
  maxConnections: number;
  rejectUnauthorized?: boolean;
};

export type AllConfigType = {
  app: AppConfig;
  apple: AppleConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
};
