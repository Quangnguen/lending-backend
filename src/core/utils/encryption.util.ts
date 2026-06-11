import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// STT-5 FIX: Đọc đúng tên biến BANK_ENCRYPTION_KEY (trước đây là ENCRYPTION_KEY — sai tên)
// STT-20 NOTE: FALLBACK_KEY chỉ dùng ở local dev. Production PHẢI set BANK_ENCRYPTION_KEY.
const FALLBACK_KEY = 'vovancovan-32-byte-secret-key-12';

const getSecretKey = (): Buffer => {
  const raw = process.env.BANK_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || FALLBACK_KEY;

  // STT-5 FIX: Cảnh báo khi đang dùng fallback key (key ai cũng biết vì nằm trong source)
  if (raw === FALLBACK_KEY) {
    console.warn(
      '[SECURITY] ⚠️  Đang dùng FALLBACK encryption key. ' +
      'Hãy đặt BANK_ENCRYPTION_KEY trong .env trước khi deploy!',
    );
  }

  if (raw.length < 16) {
    throw new Error('BANK_ENCRYPTION_KEY phải có ít nhất 16 ký tự');
  }

  return Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf8');
};

// ─────────────────────────────────────────────────────────────────────────────
// encrypt() — Deterministic IV (derive từ hash của plaintext)
//
// Dùng CHO: các field cần tìm kiếm exact-match trong MongoDB (VD: số CCCD)
// Đặc điểm: cùng plaintext → cùng ciphertext → phát hiện trùng lặp được
// Nhược điểm: pattern analysis nếu dùng cho data ít entropy
// ─────────────────────────────────────────────────────────────────────────────
export const encrypt = (text: string): string => {
  if (!text) return text;

  // Tránh double encryption — kiểm tra format iv:authTag:data
  if (_looksEncrypted(text)) return text;

  try {
    const iv = crypto.createHash('sha256').update(text).digest().slice(0, 16);
    const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch {
    return text;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// encryptRandom() — STT-20 FIX: Random IV (cryptographically secure)
//
// Dùng CHO: các field KHÔNG cần tìm kiếm exact-match (VD: địa chỉ, ngày sinh)
// Ưu điểm: mỗi lần mã hóa cho ciphertext khác nhau → không thể phân tích pattern
// Dùng IV 12 bytes — kích thước chuẩn được khuyến nghị cho AES-256-GCM
// ─────────────────────────────────────────────────────────────────────────────
export const encryptRandom = (text: string): string => {
  if (!text) return text;
  if (_looksEncrypted(text)) return text;

  try {
    const iv = crypto.randomBytes(12); // 96-bit IV — recommended for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    // Giữ cùng format iv:authTag:data — decrypt() hoạt động cho cả 2 loại
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch {
    return text;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// decrypt() — Hoạt động cho cả deterministic lẫn random IV
// ─────────────────────────────────────────────────────────────────────────────
export const decrypt = (text: string): string => {
  if (!text) return text;
  if (!_looksEncrypted(text)) return text;

  const parts = text.split(':');
  if (parts.length !== 3) return text;

  const [ivHex, authTagHex, encryptedHex] = parts;

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getSecretKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return text;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: kiểm tra chuỗi đã là ciphertext format iv:authTag:data chưa
// ─────────────────────────────────────────────────────────────────────────────
const _looksEncrypted = (text: string): boolean => {
  const parts = text.split(':');
  // IV 12 bytes = 24 hex chars, hoặc 16 bytes = 32 hex chars; authTag 16 bytes = 32 hex chars
  return (
    parts.length === 3 &&
    (parts[0].length === 24 || parts[0].length === 32) &&
    parts[1].length === 32 &&
    /^[0-9a-f]+$/i.test(parts[0]) &&
    /^[0-9a-f]+$/i.test(parts[1]) &&
    /^[0-9a-f]+$/i.test(parts[2])
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STT-5 FIX: Startup validation — gọi ở bootstrap() để chặn khởi động
// nếu BANK_ENCRYPTION_KEY không được set hoặc quá yếu trong production
// ─────────────────────────────────────────────────────────────────────────────
export const validateEncryptionKey = (): void => {
  const key = process.env.BANK_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !key) {
    throw new Error(
      '[SECURITY] BANK_ENCRYPTION_KEY chưa được đặt trong biến môi trường. ' +
      'Không thể khởi động ở môi trường production mà không có encryption key.',
    );
  }

  if (key && key.length < 16) {
    throw new Error('[SECURITY] BANK_ENCRYPTION_KEY phải có ít nhất 16 ký tự.');
  }
};
