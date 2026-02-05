import { IsString, IsEnum, IsOptional } from 'class-validator';
import { registerAs } from '@nestjs/config';
import validateConfig from '@utils/validate-config';

enum PlaidEnvironments {
  Sandbox = 'sandbox',
  Development = 'development',
  Production = 'production',
}

class EnvironmentVariablesValidator {
  @IsString()
  PLAID_CLIENT_ID: string;

  @IsString()
  PLAID_SECRET: string;

  @IsEnum(PlaidEnvironments)
  @IsOptional()
  PLAID_ENVIRONMENT: PlaidEnvironments;
}

export default registerAs('openbanking', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    plaidClientId: process.env.PLAID_CLIENT_ID,
    plaidSecret: process.env.PLAID_SECRET,
    plaidEnvironment:
      process.env.PLAID_ENVIRONMENT || PlaidEnvironments.Sandbox,
  };
});
