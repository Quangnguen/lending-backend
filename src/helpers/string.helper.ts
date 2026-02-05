export const isJson = (str: string): boolean => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

/**
 * Tạo một chuỗi ngẫu nhiên với độ dài xác định
 * @param length Độ dài của chuỗi cần tạo
 * @param type Loại chuỗi: 'alphanumeric' (mặc định) hoặc 'numeric' (chỉ số)
 * @returns Chuỗi ngẫu nhiên
 * @throws Error nếu độ dài không hợp lệ
 */
export function generateRandomString(
  length: number,
  type: 'alphanumeric' | 'numeric' = 'alphanumeric',
): string {
  const characters: string =
    type === 'numeric'
      ? '0123456789'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  if (length <= 0) {
    throw new Error('Length must be greater than 0');
  }

  let result: string = '';
  for (let i = 0; i < length; i++) {
    const randomIndex: number = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
}

/**
 * Định dạng số tiền thành chuỗi với dấu chấm
 * @param input Số tiền cần định dạng
 * @returns Chuỗi định dạng số tiền
 */
export function formatCurrency(input: number | string): string {
  if (
    input === null ||
    (typeof input !== 'number' && typeof input !== 'string')
  ) {
    return '';
  }

  const numberString = String(input).replace(/\D/g, '');

  if (numberString === '' || isNaN(Number(numberString))) {
    return '';
  }

  return numberString.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
