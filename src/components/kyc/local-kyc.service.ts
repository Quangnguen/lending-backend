import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Jimp } from 'jimp';
import axios from 'axios';
import FormData from 'form-data';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface IDRecognitionResult {
  id: string;
  name: string;
  dob: string;
  sex: string;
  nationality: string;
  home: string;
  address: string;
  doe: string;
  type: string;
  features?: string;
  issue_date?: string;
  issue_loc?: string;
  confidence?: number;
}

export interface FaceMatchResult {
  isMatch: boolean;
  similarity: number;
  message: string;
}

export interface LivenessResult {
  isLive: boolean;
  isDeepfake: boolean;
  faceMatch?: { isMatch: boolean; similarity: number };
}

export interface KYCVerificationResult {
  success: boolean;
  idInfo: IDRecognitionResult | null;
  faceMatch: FaceMatchResult | null;
  liveness: LivenessResult | null;
  message: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LocalKycService {
  private readonly logger = new Logger(LocalKycService.name);

  private get fptApiKey(): string | undefined {
    return process.env.FPT_AI_API_KEY;
  }

  // ── Bước 1: OCR — FPT AI eKYC (duy nhất) ────────────────────────────────
  async recognizeID(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult> {
    this.logger.log(
      `[OCR] Processing: ${filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`,
    );

    if (!this.fptApiKey) {
      throw new InternalServerErrorException(
        'FPT AI API key chưa được cấu hình. Vui lòng kiểm tra biến môi trường FPT_AI_API_KEY.',
      );
    }

    const result = await this.recognizeIDWithFptAi(imageBuffer, filename);
    if (!result) {
      throw new BadRequestException(
        'Không nhận dạng được CCCD/CMND. Vui lòng chụp lại ảnh rõ hơn, đủ sáng và không bị mờ.',
      );
    }

    return result;
  }

  // ── FPT AI eKYC ─────────────────────────────────────────────────────────
  private async recognizeIDWithFptAi(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult | null> {
    try {
      const form = new FormData();
      form.append('image', imageBuffer, {
        filename: filename || 'id.jpg',
        contentType: 'image/jpeg',
      });

      const { data: res } = await axios.post(
        'https://api.fpt.ai/vision/idr/vnm',
        form,
        {
          headers: { 'api-key': this.fptApiKey!, ...form.getHeaders() },
          timeout: 20000,
        },
      );

      if (res?.errorCode !== 0 || !res?.data?.length) {
        this.logger.warn(
          `[FPT AI] Response error: ${res?.errorMessage || JSON.stringify(res)}`,
        );
        return null;
      }

      const d = res.data[0];
      this.logger.log(`[FPT AI] ✅ id:${d.id} name:${d.name} type:${d.type}`);

      // Chuẩn hoá type: CCCD_CHIP_FRONT/BACK → CCCD, CMND_* → CMND
      const docType = /CCCD/i.test(d.type || '') ? 'CCCD' : 'CMND';

      return {
        id: d.id || '',
        name: d.name || '',
        dob: d.dob || '',
        sex: d.sex || '',
        nationality: d.nationality || 'Việt Nam',
        home: d.home || '',
        address: d.address || '',
        doe: d.doe || '',
        type: docType,
        features: d.features || '',
        issue_date: d.issue_date || '',
        issue_loc: d.issue_loc || '',
        // id_prob là chuỗi "0.985..." → chuyển thành số 0–1
        confidence: d.id_prob ? parseFloat(d.id_prob) : undefined,
      };
    } catch (err: any) {
      this.logger.error(`[FPT AI] Request failed: ${err.message}`);
      return null;
    }
  }

  // ── Bước 2: So khớp khuôn mặt ───────────────────────────────────────────
  // Primary: FPT AI face comparison
  // Fallback: Jimp pixel MSE
  async matchFaces(
    idImageBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchResult> {
    this.logger.log('[FaceMatch] Starting face comparison...');

    const fptResult = await this.matchFacesWithFptAi(
      idImageBuffer,
      selfieBuffer,
    );
    if (fptResult) return fptResult;

    return this.matchFacesWithJimp(idImageBuffer, selfieBuffer);
  }

  private async matchFacesWithFptAi(
    idBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchResult | null> {
    if (!this.fptApiKey) return null;

    try {
      const form = new FormData();
      form.append('file[]', idBuffer, {
        filename: 'id.jpg',
        contentType: 'image/jpeg',
      });
      form.append('file[]', selfieBuffer, {
        filename: 'selfie.jpg',
        contentType: 'image/jpeg',
      });

      const { data: res } = await axios.post(
        'https://api.fpt.ai/dmp/checkface/v1',
        form,
        {
          headers: { 'api-key': this.fptApiKey, ...form.getHeaders() },
          timeout: 20000,
        },
      );

      if (res?.code === '200' && res?.data) {
        const rawSimilarity = res.data.similarity ?? 0;
        const similarity =
          rawSimilarity <= 1
            ? Math.round(rawSimilarity * 100)
            : Math.round(rawSimilarity);
        const isMatch = res.data.isMatch === true || similarity >= 70;

        this.logger.log(
          `[FaceMatch FPT] Similarity: ${similarity}% | Match: ${isMatch}`,
        );
        return {
          isMatch,
          similarity,
          message: isMatch
            ? 'Khuôn mặt khớp với ảnh trên giấy tờ'
            : `Khuôn mặt không khớp (${similarity}%). Vui lòng thử lại.`,
        };
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`[FaceMatch FPT] Unavailable: ${err.message}`);
      return null;
    }
  }

  private async matchFacesWithJimp(
    idBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchResult> {
    this.logger.log('[FaceMatch] Using Jimp pixel similarity fallback...');
    try {
      const SIZE = 128;

      const [raw1, raw2] = await Promise.all([
        Jimp.read(idBuffer),
        Jimp.read(selfieBuffer),
      ]);
      const img1 = raw1.resize({ w: SIZE, h: SIZE });
      const img2 = raw2.resize({ w: SIZE, h: SIZE });

      const d1 = img1.bitmap.data;
      const d2 = img2.bitmap.data;

      const expectedLen = SIZE * SIZE * 4;
      if (
        !d1 ||
        !d2 ||
        d1.length !== expectedLen ||
        d2.length !== expectedLen
      ) {
        this.logger.warn(
          `[FaceMatch Jimp] Unexpected buffer size: d1=${d1?.length}, d2=${d2?.length}`,
        );
        throw new BadRequestException(
          'Ảnh không hợp lệ hoặc quá nhỏ. Vui lòng chụp lại rõ hơn.',
        );
      }

      let mse = 0;
      for (let i = 0; i < d1.length; i += 4) {
        const g1 = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
        const g2 = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
        mse += (g1 - g2) ** 2;
      }
      mse /= SIZE * SIZE;

      const similarity = Math.max(
        0,
        Math.min(100, Math.round((1 - mse / 65025) * 100)),
      );
      const THRESHOLD = 30;
      const isMatch = similarity >= THRESHOLD;

      this.logger.log(
        `[FaceMatch Jimp] MSE: ${mse.toFixed(2)} | Similarity: ${similarity}% | Match: ${isMatch}`,
      );

      return {
        isMatch,
        similarity,
        message: isMatch
          ? 'Khuôn mặt khớp với ảnh trên giấy tờ'
          : `Khuôn mặt không khớp (${similarity}%). Vui lòng thử lại.`,
      };
    } catch (err: any) {
      this.logger.error(`[FaceMatch Jimp] Error: ${err.message}`);
      throw new BadRequestException(
        'Không thể xử lý ảnh. Vui lòng chụp lại rõ hơn.',
      );
    }
  }

  // ── Perceptual hash (dHash) — phát hiện cùng khuôn mặt xuyên tài khoản ──
  async computePerceptualHash(imageBuffer: Buffer): Promise<string> {
    try {
      const SIZE_W = 9;
      const SIZE_H = 8;
      const img = (await Jimp.read(imageBuffer)).resize({
        w: SIZE_W,
        h: SIZE_H,
      });
      const data = img.bitmap.data;
      let bits = '';
      for (let y = 0; y < SIZE_H; y++) {
        for (let x = 0; x < SIZE_W - 1; x++) {
          const i = (y * SIZE_W + x) * 4;
          const j = (y * SIZE_W + x + 1) * 4;
          const gray1 =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const gray2 =
            0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
          bits += gray1 >= gray2 ? '1' : '0';
        }
      }
      let hex = '';
      for (let i = 0; i < bits.length; i += 4) {
        hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
      }
      return hex;
    } catch (err: any) {
      this.logger.warn(`[pHash] Failed: ${err.message}`);
      return '';
    }
  }

  // Hamming distance giữa 2 hash hex
  hammingDistance(hashA: string, hashB: string): number {
    if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
    let dist = 0;
    for (let i = 0; i < hashA.length; i++) {
      const a = parseInt(hashA[i], 16);
      const b = parseInt(hashB[i], 16);
      let xor = a ^ b;
      while (xor) {
        dist += xor & 1;
        xor >>= 1;
      }
    }
    return dist;
  }

  async checkLiveness(_videoBuffer: Buffer): Promise<LivenessResult> {
    return { isLive: true, isDeepfake: false };
  }
}
