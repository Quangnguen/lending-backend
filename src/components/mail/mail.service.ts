import { join } from 'path';
import { OnEvent } from '@nestjs/event-emitter';
import { MailerService } from '@nestjs-modules/mailer';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ApiError } from '@utils/api.error';
import { EVENT_ENUM } from '@constant/event.enum';
import { ResponsePayload } from '@utils/response-payload';
import { ResponseBuilder } from '@utils/response-builder';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { SendMailRequestDto } from '@components/mail/dto/send-mail.request.dto';
import { UserRepositoryInterface } from '@database/repository/user/user.repository.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private mailerService: MailerService,

    @Inject('UserRepositoryInterface')
    private readonly userRepository: UserRepositoryInterface,
  ) {}

  @OnEvent(EVENT_ENUM.SEND_MAIL)
  async sendMail(request: SendMailRequestDto): Promise<ResponsePayload<any>> {
    try {
      const { email, body } = request;

      await this.mailerService.sendMail({
        to: email,
        subject: body.subject,
        html: body.text,
        template: join(process.cwd(), 'templates', body.template),
        context: body.context,
      });

      this.logger.log(`SEND MAIL SUCCESS: ${email}`);
      return new ResponseBuilder().withCode(ResponseCodeEnum.SUCCESS).build();
    } catch (error) {
      this.logger.error('SEND MAIL ERROR: ', error);
      return new ApiError(ResponseCodeEnum.NOT_FOUND).toResponse();
    }
  }
}
