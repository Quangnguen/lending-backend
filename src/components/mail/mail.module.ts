import { join } from 'path';
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';

import { MailService } from './mail.service';
import { MailConfig } from '@components/mail/mail.config';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        secureConnection: false,
        host: new MailConfig().get('host'),
        port: new MailConfig().get('port'),
        tls: {
          ciphers: new MailConfig().get('tls'),
        },
        auth: {
          type: 'login',
          user: new MailConfig().get('username'),
          pass: new MailConfig().get('password'),
        },
      },
      defaults: {
        from: `"No Reply" <${'support@maplife.com'}>`,
      },
      template: {
        dir: join(process.cwd(), 'templates'),
        adapter: new EjsAdapter(),
        options: {
          strict: false,
        },
      },
    }),
  ],
  controllers: [],
  providers: [MailService],
})
export class MailModule {}
