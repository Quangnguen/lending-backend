import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

export type KYCImageType = 'id_front' | 'id_back' | 'selfie';

@Injectable()
export class KycCloudinaryService {
  private readonly logger = new Logger(KycCloudinaryService.name);

  /**
   * Upload ảnh KYC lên Cloudinary dưới dạng private/authenticated.
   * Ảnh sẽ KHÔNG thể truy cập qua URL trực tiếp — chỉ qua signed URL.
   *
   * @param buffer   - Buffer ảnh (từ multer memoryStorage)
   * @param userId   - ID người dùng (để tổ chức folder)
   * @param type     - Loại ảnh: 'id_front' | 'id_back' | 'selfie'
   * @returns URL bảo mật Cloudinary (https://res.cloudinary.com/...)
   */
  async uploadKYCImage(
    buffer: Buffer,
    userId: string,
    type: KYCImageType,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const publicId = `kyc/${userId}/${type}`;

      const upload = cloudinary.uploader.upload_stream(
        {
          folder: undefined, // publicId đã chứa folder path
          public_id: publicId, // Ghi đè ảnh cũ cùng loại (Re-KYC)
          overwrite: true,
          resource_type: 'image',
          type: 'authenticated', // Private — không thể truy cập công khai
          invalidate: true, // Xóa cache CDN của ảnh cũ
          tags: ['kyc', userId, type],
        },
        (error, result: UploadApiResponse) => {
          if (error) {
            this.logger.error(
              `[KYC Cloudinary] Upload failed for ${userId}/${type}: ${error.message}`,
            );
            return reject(error);
          }
          this.logger.log(
            `[KYC Cloudinary] ✅ Uploaded ${type} for user ${userId}: ${result.public_id}`,
          );
          resolve(result.secure_url);
        },
      );

      const stream = Readable.from(buffer);
      stream.pipe(upload);
    });
  }

  /**
   * Xóa ảnh KYC khỏi Cloudinary (dùng khi xóa tài khoản).
   */
  async deleteKYCImage(userId: string, type: KYCImageType): Promise<void> {
    try {
      const publicId = `kyc/${userId}/${type}`;
      await cloudinary.uploader.destroy(publicId, { type: 'authenticated' });
      this.logger.log(`[KYC Cloudinary] Deleted ${publicId}`);
    } catch (err) {
      this.logger.warn(
        `[KYC Cloudinary] Failed to delete ${userId}/${type}: ${err.message}`,
      );
    }
  }

  /**
   * Tạo signed URL có thời hạn để xem ảnh KYC private.
   * Dùng cho admin panel khi cần xem ảnh.
   *
   * @param userId  - ID người dùng
   * @param type    - Loại ảnh
   * @param expiresInSeconds - Thời gian hết hạn (mặc định 15 phút)
   */
  generateSignedUrl(
    userId: string,
    type: KYCImageType,
    expiresInSeconds = 900,
  ): string {
    const publicId = `kyc/${userId}/${type}`;
    const expireAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

    return cloudinary.url(publicId, {
      type: 'authenticated',
      sign_url: true,
      expires_at: expireAt,
      resource_type: 'image',
      secure: true,
    });
  }
}
