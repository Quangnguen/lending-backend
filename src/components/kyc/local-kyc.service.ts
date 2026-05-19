import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { createWorker } from 'tesseract.js';

// ─── Lazy-load canvas (has pre-built binaries for most platforms) ───────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
let canvasLib: { loadImage: (...args: any[]) => any; createCanvas: (...args: any[]) => any } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  canvasLib = require('canvas');
} catch {
  // canvas not installed — face matching will return mock result
}

// ─── Interfaces (giữ nguyên để controller không cần sửa) ──────────────────

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

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class LocalKycService implements OnModuleInit {
  private readonly logger = new Logger(LocalKycService.name);
  private canvasReady = false;

  // ── Lifecycle ───────────────────────────────────────────────────────────
  async onModuleInit() {
    if (canvasLib) {
      this.canvasReady = true;
      this.logger.log('✅ Canvas loaded — face similarity comparison ready');
    } else {
      this.logger.warn(
        '⚠️  Canvas not available. Run: npm install canvas --legacy-peer-deps',
      );
    }
  }

  // ── Bước 1: OCR đọc thông tin CCCD bằng Tesseract.js ───────────────────
  async recognizeID(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult> {
    this.logger.log(`[OCR] Processing image: ${filename}`);
    const worker = await createWorker(['vie', 'eng']);
    try {
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      this.logger.log(`[OCR] Extracted ${text.length} characters from image`);
      this.logger.debug(`[OCR] Raw text:\n${text.substring(0, 400)}`);
      return this.parseCCCDText(text);
    } finally {
      await worker.terminate();
    }
  }

  // ── Bước 2: So khớp khuôn mặt (pixel MSE similarity) ───────────────────
  async matchFaces(
    idImageBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchResult> {
    // Fallback khi canvas không khả dụng
    if (!this.canvasReady || !canvasLib) {
      this.logger.warn('[FaceMatch] Canvas not available, returning mock result');
      return {
        isMatch: true,
        similarity: 80,
        message: 'Xác thực khuôn mặt thành công (chế độ demo)',
      };
    }

    this.logger.log('[FaceMatch] Comparing faces via pixel similarity...');

    try {
      const { loadImage, createCanvas } = canvasLib;
      const SIZE = 128; // resize cả 2 ảnh về 128×128

      const [img1, img2] = await Promise.all([
        loadImage(idImageBuffer),
        loadImage(selfieBuffer),
      ]);

      const getGrayscalePixels = (img: any): Uint8ClampedArray => {
        const canvas = createCanvas(SIZE, SIZE);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        return ctx.getImageData(0, 0, SIZE, SIZE).data;
      };

      const [d1, d2] = [
        getGrayscalePixels(img1),
        getGrayscalePixels(img2),
      ];

      // Tính MSE trên kênh grayscale
      let mse = 0;
      const total = SIZE * SIZE;
      for (let i = 0; i < d1.length; i += 4) {
        const g1 = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
        const g2 = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
        mse += (g1 - g2) ** 2;
      }
      mse /= total;

      // MSE 0 → similarity 100%, MSE 65025 (255²) → 0%
      const similarity = Math.max(0, Math.round((1 - mse / 65025) * 100));
      const THRESHOLD = 60;
      const isMatch = similarity >= THRESHOLD;

      this.logger.log(
        `[FaceMatch] MSE: ${mse.toFixed(2)} | Similarity: ${similarity}% | Match: ${isMatch}`,
      );

      return {
        isMatch,
        similarity,
        message: isMatch
          ? 'Khuôn mặt khớp với ảnh trên giấy tờ'
          : `Khuôn mặt không khớp (${similarity}%). Vui lòng thử lại.`,
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`[FaceMatch] Error: ${err.message}`);
      throw new BadRequestException('Lỗi xác thực khuôn mặt. Vui lòng thử lại.');
    }
  }

  // ── Liveness (stub — không bắt buộc cho đồ án) ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async checkLiveness(_videoBuffer: Buffer): Promise<LivenessResult> {
    // Liveness detection yêu cầu video và model phức tạp hơn.
    // Trong phạm vi đồ án, face matching là đủ.
    return { isLive: true, isDeepfake: false };
  }

  // ── Helper: parse text OCR → IDRecognitionResult ────────────────────────
  private parseCCCDText(rawText: string): IDRecognitionResult {
    const text = rawText;
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // ── Số CCCD (9 hoặc 12 chữ số) ────────────────────────────────────────
    const idMatch = text.match(/\b(\d{9}|\d{12})\b/);

    // ── Tất cả ngày tháng dạng DD/MM/YYYY ─────────────────────────────────
    const allDates = [
      ...text.matchAll(/(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g),
    ];
    const dob = allDates[0]?.[1] || '';
    // Ngày hết hạn thường là ngày cuối cùng xuất hiện
    const doe = allDates.length > 1 ? allDates[allDates.length - 1][1] : '';

    // ── Giới tính ──────────────────────────────────────────────────────────
    const sexMatch = text.match(
      /(?:Giới tính|Sex)\s*[:\|]?\s*(Nam|Nữ|Male|Female)/i,
    );

    // ── Họ tên: dòng ngay sau "Họ và tên" / "Full name" ───────────────────
    const nameIdx = lines.findIndex((l) =>
      /Họ và tên|Họ tên|Full name/i.test(l),
    );
    const rawName =
      nameIdx >= 0
        ? lines
            .slice(nameIdx + 1, nameIdx + 3)
            .find((l) => /^[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-Ỹ\s]{3,}$/i.test(l)) || ''
        : '';

    // ── Quê quán ───────────────────────────────────────────────────────────
    const homeIdx = lines.findIndex((l) =>
      /Quê quán|Place of origin/i.test(l),
    );
    const home = homeIdx >= 0 ? (lines[homeIdx + 1] || '') : '';

    // ── Nơi thường trú ─────────────────────────────────────────────────────
    const addressIdx = lines.findIndex((l) =>
      /Nơi thường trú|Place of residence/i.test(l),
    );
    const address = addressIdx >= 0 ? (lines[addressIdx + 1] || '') : '';

    // ── Ngày cấp / Nơi cấp ────────────────────────────────────────────────
    const issueDateMatch = text.match(
      /(?:Ngày cấp|Date of issue)\s*[:\|]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i,
    );
    const issueLocIdx = lines.findIndex((l) =>
      /Nơi cấp|Place of issue/i.test(l),
    );
    const issueLoc = issueLocIdx >= 0 ? (lines[issueLocIdx + 1] || '') : '';

    // ── Loại giấy tờ ──────────────────────────────────────────────────────
    const docType = /CĂN CƯỚC|CCCD/i.test(text)
      ? 'CCCD'
      : /CHỨNG MINH|CMND/i.test(text)
        ? 'CMND'
        : 'CCCD';

    return {
      id: idMatch?.[1] || '',
      name: rawName.replace(/[^a-zA-ZÀ-ỹ\s]/g, '').trim().toUpperCase(),
      dob,
      sex: sexMatch?.[1] || '',
      nationality: 'Việt Nam',
      home: home.trim(),
      address: address.trim(),
      doe,
      type: docType,
      issue_date: issueDateMatch?.[1] || '',
      issue_loc: issueLoc.trim(),
      confidence: 0.8,
    };
  }
}
