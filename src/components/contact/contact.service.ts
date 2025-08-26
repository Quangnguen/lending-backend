import { isEmpty, keyBy } from 'lodash';
import { I18nService } from 'nestjs-i18n';
import { plainToInstance } from 'class-transformer';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { BOOLEAN_ENUM } from '@constant/app.enum';
import { EVENT_ENUM } from '@constant/event.enum';
import { ResponseBuilder } from '@utils/response-builder';
import { IdParamDto } from '@core/dto/param-id.request.dto';
import { BaseResponseDto } from '@core/dto/base.response.dto';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { MAIL_TEMPLATE_ENUM } from '@components/mail/mail.constant';
import { SendMailRequestDto } from '@components/mail/dto/send-mail.request.dto';
import { CreateContactRequestDto } from './dto/request/create-contact.request.dto';
import { BusinessException } from '@core/exception-filter/business-exception.filter';
import { GetListContactRequestDto } from './dto/request/get-list-contact.request.dto';
import { ResponseContactRequestDto } from './dto/request/response-contact.request.dto';
import { GetDetailContactRequestDto } from './dto/request/get-detail-contact.request.dto';
import { GetContactDetailResponseDto } from './dto/response/get-contact-detail.response.dto';
import { UserRepositoryInterface } from '@database/repository/user/user.repository.interface';
import { ContactRepositoryInterface } from '@database/repository/contact/contact.repository.interface';

@Injectable()
export class ContactService {
  constructor(
    private readonly i18n: I18nService,

    private readonly eventEmitter: EventEmitter2,

    @Inject('UserRepositoryInterface')
    private readonly userRepository: UserRepositoryInterface,

    @Inject('ContactRepositoryInterface')
    private readonly contactRepository: ContactRepositoryInterface,
  ) {}

  async create(request: CreateContactRequestDto) {
    const contactEntity = this.contactRepository.createEntity(request);
    const contact = await contactEntity.save();

    const response = plainToInstance(BaseResponseDto, contact, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.CREATED)
      .withMessage(this.i18n.translate('message.CREATE_SUCCESS'))
      .build();
  }

  async list(request: GetListContactRequestDto) {
    const { data, total } = await this.contactRepository.list(request);

    const respondedByIdsSet = new Set<string>();
    data?.forEach((contact) => {
      if (contact?.respondedBy) {
        respondedByIdsSet.add(contact?.respondedBy?.toString());
      }
    });

    const respondedUsers = await this.userRepository.find({
      _id: {
        $in: [...respondedByIdsSet],
      },
    });

    const userMap = keyBy(respondedUsers, '_id');
    data?.forEach((contact) => {
      contact['respondedBy'] = userMap[contact?.respondedBy?.toString()] as any;
    });

    const response = plainToInstance(GetContactDetailResponseDto, data, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder({
      items: response,
      meta: { total, page: request.page },
    })
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  async getDetail(request: GetDetailContactRequestDto) {
    const { id } = request;

    const contact = await this.contactRepository.getDetail(id);
    if (isEmpty(contact)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    const response = plainToInstance(GetContactDetailResponseDto, contact, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  async delete(request: IdParamDto) {
    const { id } = request;

    const contact = await this.contactRepository.getDetail(id);
    if (isEmpty(contact)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    contact.deletedAt = new Date();
    await contact.save();

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.DELETE_SUCCESS'))
      .build();
  }

  async response(request: ResponseContactRequestDto) {
    const { id, response, userId } = request;

    const contact = await this.contactRepository.getDetail(id);
    if (isEmpty(contact)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    if (contact.isResponded) {
      throw new BusinessException(
        this.i18n.translate('error.STATUS_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    contact.response = response;
    contact.respondedBy = userId;
    contact.respondedAt = new Date();
    contact.isResponded = BOOLEAN_ENUM.TRUE;

    await contact.save();

    const payloadSendEmail = {
      email: contact.email,
      body: {
        template: MAIL_TEMPLATE_ENUM.RESPONSE_CONTACT,
        subject: this.i18n.translate('email.RESPONSE_CONTACT'),
        context: {
          message: contact.message,
          response: contact.response,
        },
      },
    } as SendMailRequestDto;

    this.eventEmitter.emit(EVENT_ENUM.SEND_MAIL, payloadSendEmail);

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }
}
