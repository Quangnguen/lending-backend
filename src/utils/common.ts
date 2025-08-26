import { replace } from 'lodash';

export const REGEX_FOR_FILTER =
  /[^a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵýỷỹ 0-9]/gi;

export const mergePayload = (param: any, body: any): any => {
  const keys = [...new Set([...Object.keys(param), ...Object.keys(body)])];
  const payload: any = {};
  keys.forEach((key) => {
    payload[key] = {
      ...param[key],
      ...body[key],
    };
  });

  return payload;
};

export const getValueOrDefault = <T>(value: any, defaultValue: T): T => {
  return value !== null && value !== undefined ? (value as T) : defaultValue;
};

export const isDevMode = () => {
  return (
    process.env.NODE_ENV.startsWith('dev') ||
    process.env.NODE_ENV.startsWith('local') ||
    process.env.NODE_ENV.startsWith('stag')
  );
};

export enum EnumSort {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum SortOrder {
  ASC = 1,
  DESC = -1,
}

export const convertOrderMongo = (orderText: string): number => {
  return orderText?.toLowerCase() === 'desc' ? -1 : 1;
};

export const getRegexByValue = (value: string) => {
  return {
    $regex: '.*' + replace(value, REGEX_FOR_FILTER, (e) => `\\${e}`) + '.*',
    $options: 'i',
  };
};
