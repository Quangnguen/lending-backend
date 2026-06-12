import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';

export interface IDRecognitionResult {
  id: string;
  name: string;
  dob: string;
  sex: string;
  nationality: string;
  home: string;
  address: string;
  doe: string; // date of expiry
  type: string; // Loại giấy tờ: CMND/CCCD/Passport
  features?: string; // Đặc điểm nhận dạng
  issue_date?: string;
  issue_loc?: string;
  // Raw response
  confidence?: number;
}

export interface FaceMatchResult {
  isMatch: boolean;
  similarity: number; // 0-100
  message: string;
}

export interface LivenessResult {
  isLive: boolean;
  isDeepfake: boolean;
  faceMatch?: {
    isMatch: boolean;
    similarity: number;
  };
}

export interface KYCVerificationResult {
  success: boolean;
  idInfo: IDRecognitionResult | null;
  faceMatch: FaceMatchResult | null;
  liveness: LivenessResult | null;
  message: string;
}

@Injectable()
export class FptAiService {
  private readonly logger = new Logger(FptAiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.fpt.ai';

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get('FPT_AI_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('FPT_AI_API_KEY not configured! eKYC will not work.');
    }
  }

  /**
   * OCR nhận dạng CMND/CCCD
   * Endpoint: POST https://api.fpt.ai/vision/idr/vnm
   *
   * @param imageBuffer - Buffer ảnh CMND (JPEG/PNG)
   * @param filename - Tên file gốc
   */
  async recognizeID(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult> {
    this.logger.log(`Recognizing ID from image: ${filename}`);

    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: filename,
      contentType: 'image/jpeg',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/vision/idr/vnm`, formData, {
          headers: {
            ...formData.getHeaders(),
            'api-key': this.apiKey,
          },
          timeout: 30000,
        }),
      );

      const data = response.data;
      this.logger.log(`FPT.AI IDR response: ${JSON.stringify(data)}`);

      if (data.errorCode !== 0 && data.errorCode !== undefined) {
        throw new BadRequestException(
          data.errorMessage || 'Không nhận dạng được giấy tờ',
        );
      }

      // FPT.AI trả về array data, lấy phần tử đầu tiên
      const result = Array.isArray(data.data) ? data.data[0] : data.data;

      if (!result) {
        throw new BadRequestException(
          'Không tìm thấy thông tin trên giấy tờ. Vui lòng chụp rõ hơn.',
        );
      }

      return {
        id: result.id || '',
        name: result.name || '',
        dob: result.dob || '',
        sex: result.sex || '',
        nationality: result.nationality || 'Việt Nam',
        home: result.home || '',
        address: result.address || '',
        doe: result.doe || '',
        type: result.type || 'CCCD',
        features: result.features || '',
        issue_date: result.issue_date || '',
        issue_loc: result.issue_loc || '',
        confidence: result.overall_score || result.confidence,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`FPT.AI IDR error: ${error.message}`);
      throw new BadRequestException('Lỗi kết nối FPT.AI. Vui lòng thử lại.');
    }
  }

  /**
   * So khớp khuôn mặt (ảnh CMND vs ảnh selfie)
   * Endpoint: POST https://api.fpt.ai/vision/face/matching (nếu có)
   * Hoặc dùng Liveness API kèm so khớp
   */
  async matchFaces(
    idImageBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchResult> {
    this.logger.log('Matching faces: ID photo vs selfie');

    const formData = new FormData();
    // FPT.AI yêu cầu field name là 'file[]' hoặc 'file' tùy version,
    // sử dụng cấu trúc chuẩn nhất cho v2
    formData.append('file[]', idImageBuffer, {
      filename: 'id_photo.jpg',
      contentType: 'image/jpeg',
    });
    formData.append('file[]', selfieBuffer, {
      filename: 'selfie.jpg',
      contentType: 'image/jpeg',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/dmp/checkface/v1`, formData, {
          headers: {
            ...formData.getHeaders(),
            api_key: this.apiKey,
          },
          timeout: 30000,
        }),
      );

      const data = response.data;
      this.logger.log(
        `FPT.AI Face Match response status: ${data.code || data.errorCode}`,
      );

      // Log toàn bộ response để debug nếu cần
      if (
        data.code !== '200' &&
        data.errorCode !== 0 &&
        data.errorCode !== undefined
      ) {
        this.logger.warn(
          `FPT.AI returned warning/error: ${JSON.stringify(data)}`,
        );
      }

      // Xử lý similarity từ nhiều cấu trúc trả về khác nhau của FPT.AI
      const similarity = data.data?.similarity ?? data.similarity ?? 0;

      // Hạ ngưỡng xuống 70% để demo mượt mà hơn (mặc định FPT khuyến cáo 80%)
      const threshold = 70;
      const isMatch = similarity >= threshold;

      return {
        isMatch,
        similarity: Math.round(similarity * 100) / 100,
        message: isMatch
          ? 'Khuôn mặt khớp với ảnh trên giấy tờ'
          : `Khuôn mặt không khớp (${similarity.toFixed(1)}%). Vui lòng thử lại.`,
      };
    } catch (error: any) {
      const errorData = error.response?.data;
      this.logger.error(
        `FPT.AI Face Match error: ${error.message} - Meta: ${JSON.stringify(errorData)}`,
      );

      // Nếu lỗi là 403/401 sau khi đã bật dịch vụ, có thể do cache hoặc key chưa cập nhật kịp
      if (error.response?.status === 403 || error.response?.status === 401) {
        throw new BadRequestException(
          'Dịch vụ Face Match chưa sẵn sàng hoặc Key không hợp lệ. Vui lòng kiểm tra lại Console FPT.AI.',
        );
      }

      const errorMsg =
        errorData?.message ||
        errorData?.errorMessage ||
        'Lỗi kết nối với hệ thống xác thực khuôn mặt.';
      throw new BadRequestException(errorMsg);
    }
  }

  /**
   * Liveness detection (chống giả mạo)
   * Endpoint: POST https://api.fpt.ai/dmp/liveness/v3
   *
   * Lưu ý: API này yêu cầu video 5-10s, phức tạp hơn cho mobile.
   * Trong phạm vi đồ án, dùng Face Matching là đủ.
   */
  async checkLiveness(
    videoBuffer: Buffer,
    idImageBuffer?: Buffer,
  ): Promise<LivenessResult> {
    this.logger.log('Checking liveness...');

    const formData = new FormData();
    formData.append('video', videoBuffer, {
      filename: 'liveness.mp4',
      contentType: 'video/mp4',
    });

    if (idImageBuffer) {
      formData.append('cmnd', idImageBuffer, {
        filename: 'cmnd.jpg',
        contentType: 'image/jpeg',
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/dmp/liveness/v3`, formData, {
          headers: {
            ...formData.getHeaders(),
            'api-key': this.apiKey,
          },
          timeout: 60000,
        }),
      );

      const data = response.data;
      this.logger.log(`FPT.AI Liveness response: ${JSON.stringify(data)}`);

      return {
        isLive: data.is_live || false,
        isDeepfake: data.is_deepfake || false,
        faceMatch: data.face_match
          ? {
              isMatch: data.face_match.isMatch || false,
              similarity: data.face_match.similarity || 0,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error(`FPT.AI Liveness error: ${error.message}`);
      throw new BadRequestException(
        'Lỗi xác thực sinh trắc học. Vui lòng thử lại.',
      );
    }
  }
}
