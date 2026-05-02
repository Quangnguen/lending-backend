import { IsString, IsOptional } from 'class-validator';
import { registerAs } from '@nestjs/config';
import validateConfig from '@utils/validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  VIETQR_API_URL: string;

  @IsString()
  @IsOptional()
  VIETQR_CLIENT_ID: string;

  @IsString()
  @IsOptional()
  VIETQR_API_KEY: string;
}

export default registerAs('openbanking', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    vietqrApiUrl: process.env.VIETQR_API_URL || 'https://api.vietqr.io/v2',
    vietqrImageUrl: process.env.VIETQR_IMAGE_URL || 'https://img.vietqr.io/image',
    vietqrClientId: process.env.VIETQR_CLIENT_ID || '',
    vietqrApiKey: process.env.VIETQR_API_KEY || '',
  };
});
