import { isEmpty } from 'lodash';
import { I18nService } from 'nestjs-i18n';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { Inject, Injectable } from '@nestjs/common';

import { ResponseBuilder } from '@utils/response-builder';
import { IdParamDto } from '@core/dto/param-id.request.dto';
import { BaseResponseDto } from '@core/dto/base.response.dto';
import { ResponseCodeEnum } from '@constant/response-code.enum';
import { ROLE_ENUM, USER_STATUS_ENUM } from '@constant/p2p-lending.enum';
import { CreateUserRequestDto } from './dto/request/create-user.request.dto';
import { UpdateUserRequestDto } from './dto/request/update-user.request.dto';
import { GetListUserRequestDto } from './dto/request/get-list-user.request.dto';
import { GetDetailUserRequestDto } from './dto/request/get-detail-user.request.dto';
import { BusinessException } from '@core/exception-filter/business-exception.filter';
import { GetUserDetailResponseDto } from './dto/response/get-user-detail.response.dto';
import { UserRepositoryInterface } from '@database/repository/user/user.repository.interface';

@Injectable()
export class UserService {
  constructor(
    private readonly i18n: I18nService,

    @Inject('UserRepositoryInterface')
    private readonly userRepository: UserRepositoryInterface,
  ) {}

  async create(request: CreateUserRequestDto) {
    const { email } = request;
    const emailExist = await this.userRepository.findOne({ email });

    if (!isEmpty(emailExist)) {
      throw new BusinessException(
        this.i18n.translate('error.EMAIL_EXIST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const userEntity = this.userRepository.createEntity(request);
    const user = await userEntity.save();

    const response = plainToInstance(BaseResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.CREATED)
      .withMessage(this.i18n.translate('message.CREATE_SUCCESS'))
      .build();
  }

  async list(request: GetListUserRequestDto) {
    const { data, total } = await this.userRepository.list(request);

    const response = plainToInstance(GetUserDetailResponseDto, data, {
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

  async getDetail(request: GetDetailUserRequestDto) {
    const { id } = request;

    const user = await this.userRepository.getDetail(id);
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    const response = plainToInstance(GetUserDetailResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUCCESS'))
      .build();
  }

  async update(request: UpdateUserRequestDto) {
    const { id, email } = request;

    const user = await this.userRepository.getDetail(id);
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    if (email !== user.email) {
      const emailExist = await this.userRepository.findOne({ email });
      if (!isEmpty(emailExist)) {
        throw new BusinessException(
          this.i18n.translate('error.EMAIL_EXIST'),
          ResponseCodeEnum.BAD_REQUEST,
        );
      }
    }

    const userEntity = this.userRepository.updateEntity(user, request);
    await userEntity.save();

    const response = plainToInstance(GetUserDetailResponseDto, userEntity, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.UPDATE_SUCCESS'))
      .build();
  }

  async delete(request: IdParamDto) {
    const { id, userId } = request;

    if (id === userId) {
      throw new BusinessException(
        this.i18n.translate('error.BAD_REQUEST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const user = await this.userRepository.getDetail(id);
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    user.deletedBy = new Types.ObjectId(userId);
    user.deletedAt = new Date();
    await user.save();

    return new ResponseBuilder()
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.DELETE_SUCCESS'))
      .build();
  }

  async suspend(request: IdParamDto) {
    const { id, userId } = request;

    if (id === userId) {
      throw new BusinessException(
        this.i18n.translate('error.BAD_REQUEST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const user = await this.userRepository.getDetail(id);
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    if (user.role === ROLE_ENUM.ADMIN) {
      throw new BusinessException(
        this.i18n.translate('error.BAD_REQUEST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    if (user.status === USER_STATUS_ENUM.SUSPENDED) {
      throw new BusinessException(
        this.i18n.translate('error.STATUS_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    user.status = USER_STATUS_ENUM.SUSPENDED;
    await user.save();

    const response = plainToInstance(GetUserDetailResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.SUSPEND_SUCCESS'))
      .build();
  }

  async activate(request: IdParamDto) {
    const { id, userId } = request;

    if (id === userId) {
      throw new BusinessException(
        this.i18n.translate('error.BAD_REQUEST'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    const user = await this.userRepository.getDetail(id);
    if (isEmpty(user)) {
      throw new BusinessException(
        this.i18n.translate('error.NOT_FOUND'),
        ResponseCodeEnum.NOT_FOUND,
      );
    }

    if (user.status === USER_STATUS_ENUM.ACTIVE) {
      throw new BusinessException(
        this.i18n.translate('error.STATUS_INVALID'),
        ResponseCodeEnum.BAD_REQUEST,
      );
    }

    user.status = USER_STATUS_ENUM.ACTIVE;
    await user.save();

    const response = plainToInstance(GetUserDetailResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return new ResponseBuilder(response)
      .withCode(ResponseCodeEnum.SUCCESS)
      .withMessage(this.i18n.translate('message.ACTIVATE_SUCCESS'))
      .build();
  }
}
