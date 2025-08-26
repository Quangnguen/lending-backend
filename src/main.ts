import 'colors';
import { join } from 'path';
import * as moment from 'moment';
import * as morgan from 'morgan';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerTheme, SwaggerThemeNameEnum } from 'swagger-themes';

import { AppModule } from './app.module';
import { isDevMode } from '@utils/common';
import { AllConfigType } from '@config/config.type';
import { SortQueryPipe } from '@core/pipe/sort-query.pipe';
import { FilterQueryPipe } from '@core/pipe/filter-query.pipe';
import { BusinessExceptionFilter } from '@core/exception-filter/business-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService<AllConfigType>);
  const configApp = configService.get('app', { infer: true });

  const { port, apiPrefix, backendDomain } = configApp;

  app.setViewEngine('ejs');
  app.setBaseViewsDir(join(__dirname, '..', 'src', 'views'));

  if (isDevMode()) {
    const config = new DocumentBuilder()
      .setTitle('API docs')
      .addBearerAuth(
        { type: 'http', description: 'Access token' },
        'access-token',
      )
      .setVersion('1.0')
      .addServer(`${backendDomain}:${port}/${apiPrefix}`, 'Development Server')
      .build();

    const theme = new SwaggerTheme();
    const options = {
      explorer: true,
      swaggerOptions: { persistAuthorization: true },
      customCss: theme.getBuffer(SwaggerThemeNameEnum.DARK),
    };

    const endPointDocsApi = `${apiPrefix}/swagger-docs`;
    const pagerDocument = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup(`${endPointDocsApi}`, app, pagerDocument, options);

    console.log(
      `Swagger Docs: ${backendDomain}:${port}/${endPointDocsApi}`.cyan.bold,
    );

    app.use(morgan('dev'));
  }

  app.enableCors({
    origin: '*',
    credentials: true,
    exposedHeaders: ['Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  app.set('trust proxy', true);
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(new SortQueryPipe());
  app.useGlobalPipes(new FilterQueryPipe());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalFilters(new BusinessExceptionFilter());

  await app.listen(port, () => {
    console.log(`Server is running on port: ${port}`.green.bold);
  });
}

bootstrap();

// Thiết lập ngày đầu tuần là Thứ Hai
moment.updateLocale('vi', { week: { dow: 1 } });
