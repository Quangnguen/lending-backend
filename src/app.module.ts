import {
  I18nModule,
  QueryResolver,
  HeaderResolver,
  CookieResolver,
  I18nJsonLoader,
  AcceptLanguageResolver,
} from 'nestjs-i18n';
import Redis from 'ioredis';
import * as path from 'path';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

import appConfig from '@config/app.config';
import { AppService } from './app.service';
import authConfig from '@config/auth.config';
import { AppController } from './app.controller';
import { AllConfigType } from '@config/config.type';
import databaseConfig from '@config/database.config';
import { AuthenGuard } from '@core/guards/authen.guard';
import { AuthModule } from '@components/auth/auth.module';
import { UserModule } from '@components/user/user.module';
import { MailModule } from '@components/mail/mail.module';
import { FileModule } from '@components/file/file.module';
import { CronModule } from '@components/cron/cron.module';
import { ValidationPipe } from '@core/pipe/validator.pipe';
import { ContactModule } from '@components/contact/contact.module';
import { MongoConnectModule } from '@database/mongo.connect.module';
import { CustomThrottlerGuard } from '@core/guards/custom-throttler.guard';
import { RedisCacheModule } from '@core/components/redis/redis-cache.module';
import { RequestLoggingMiddleware } from '@core/middlewares/request-logging.middleware';
import openbankingConfig from '@config/openbanking.config';
import { OpenBankingModule } from '@components/openbanking/openbanking.module';
import { CreditModule } from '@components/credit/credit.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '..', 'src', 'views'),
      serveRoot: '/views',
    }),
    JwtModule.register({}),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, openbankingConfig],
      envFilePath: ['.env'],
    }),
    I18nModule.forRootAsync({
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        fallbackLanguage: configService.getOrThrow('app.fallbackLanguage', {
          infer: true,
        }),
        loader: I18nJsonLoader,
        loaderOptions: { path: path.join(__dirname, '/i18n/'), watch: true },
      }),
      resolvers: [
        new CookieResolver(),
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
        { use: QueryResolver, options: ['lang', 'locale', 'l'] },
      ],
      imports: [ConfigModule],
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 1000,
        },
      ],
      storage: new ThrottlerStorageRedisService(
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
        }),
      ),
    }),
    MongoConnectModule,
    EventEmitterModule.forRoot(),
    MailModule,
    FileModule,
    UserModule,
    AuthModule,
    CronModule,
    ContactModule,
    RedisCacheModule,
    OpenBankingModule,
    CreditModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: AuthenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    AppService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
