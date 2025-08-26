import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AppService } from './app.service';
import { Public } from '@core/decorators/public.decorator';
import { ResponseCodeEnum } from '@constant/response-code.enum';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    tags: ['Base'],
    summary: 'Hello world',
    description: 'Hello world',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  @SkipThrottle()
  @Get('/')
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({
    tags: ['Base'],
    summary: 'Ping',
    description: 'Ping',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  @Get('/ping')
  @Public()
  ping(): string {
    return 'pong';
  }

  @ApiOperation({
    tags: ['Base'],
    summary: 'Health check',
    description: 'Health check',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
  })
  @Get('/health-check')
  @Public()
  healthCheck(): { statusCode: ResponseCodeEnum; message: string } {
    return { statusCode: ResponseCodeEnum.SUCCESS, message: 'OK' };
  }
}
