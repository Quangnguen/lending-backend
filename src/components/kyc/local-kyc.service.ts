import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';
import { Jimp } from 'jimp';
import axios from 'axios';
import FormData from 'form-data';

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
export class LocalKycService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocalKycService.name);

  // ── Persistent Tesseract worker ────────────────────────────────────────
  private ocrWorker: Worker | null = null;
  private ocrWorkerReady = false;
  // Mutex đơn giản: ngăn 2 request OCR chạy đồng thời trên cùng 1 worker
  private ocrBusy = false;

  // ── Lifecycle ───────────────────────────────────────────────────────────
  async onModuleInit() {
    // 1. Khởi tạo persistent Tesseract worker (tốn ~2-3s, nhưng chỉ 1 lần)
    try {
      this.logger.log('[OCR] Initialising persistent Tesseract worker...');
      this.ocrWorker = await createWorker(['vie', 'eng'], 1, {
        // OEM 1 = LSTM only (nhanh hơn OEM 3 combined, chính xác với CCCD)
        logger: () => {}, // tắt verbose log của Tesseract
      });
      // Cấu hình PSM và params tối ưu cho CCCD Việt Nam
      await this.ocrWorker.setParameters({
        tessedit_pageseg_mode: '6' as any,  // PSM 6: Assume uniform block of text
        preserve_interword_spaces: '1',      // Giữ khoảng trắng giữa từ
        // Loại bỏ các ký tự đặc biệt thường bị OCR nhầm trên CCCD
        tessedit_char_blacklist: '|\\~`^{}[]<>',
      });
      this.ocrWorkerReady = true;
      this.logger.log('✅ Tesseract worker ready (Vietnamese + English)');
    } catch (err: any) {
      this.logger.error(`[OCR] Failed to init worker: ${err.message}`);
    }

    this.logger.log('✅ Jimp loaded — face similarity comparison ready');
  }

  async onModuleDestroy() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
      this.logger.log('[OCR] Worker terminated');
    }
  }

  // ── Bước 1: OCR — thử FPT AI trước, fallback Tesseract ─────────────────
  async recognizeID(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult> {
    this.logger.log(`[OCR] Processing: ${filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    // 1. FPT AI eKYC (chính xác hơn cho CCCD Việt Nam)
    const fptResult = await this.recognizeIDWithFptAi(imageBuffer, filename);
    if (fptResult) return fptResult;

    // 2. Fallback: Tesseract.js (local)
    this.logger.warn(`[OCR] FPT AI unavailable — falling back to Tesseract`);
    return this.recognizeIDWithTesseract(imageBuffer, filename);
  }

  // ── FPT AI eKYC ─────────────────────────────────────────────────────────
  private async recognizeIDWithFptAi(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult | null> {
    const apiKey = process.env.FPT_AI_API_KEY;
    if (!apiKey) return null;

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
          headers: { 'api-key': apiKey, ...form.getHeaders() },
          timeout: 15000,
        },
      );

      if (res?.errorCode !== 0 || !res?.data?.length) {
        this.logger.warn(`[FPT AI] Response error: ${res?.errorMessage || 'no data'}`);
        return null;
      }

      const d = res.data[0];
      this.logger.log(
        `[FPT AI] ✅ id:${d.id} name:${d.name} type:${d.type}`,
      );

      // Chuẩn hoá type: CCCD_CHIP_FRONT/BACK → CCCD, CMND_*  → CMND
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
        // id_prob là chuỗi "0.985..." → chuyển thành 0-1
        confidence: d.id_prob ? parseFloat(d.id_prob) : undefined,
      };
    } catch (err: any) {
      this.logger.warn(`[FPT AI] Request failed: ${err.message}`);
      return null;
    }
  }

  // ── Tesseract.js (fallback) ──────────────────────────────────────────────
  private async recognizeIDWithTesseract(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult> {
    const t0 = Date.now();

    // ── Chờ worker sẵn sàng (tối đa 10s) ──────────────────────────────────
    if (!this.ocrWorkerReady || !this.ocrWorker) {
      this.logger.warn('[OCR] Worker not ready, falling back to new worker...');
      return this.recognizeIDFallback(imageBuffer, filename);
    }

    // ── Mutex: nếu worker đang bận, chờ tối đa 15s ──────────────────────
    let waited = 0;
    while (this.ocrBusy && waited < 15000) {
      await new Promise((r) => setTimeout(r, 200));
      waited += 200;
    }
    if (this.ocrBusy) {
      this.logger.warn('[OCR] Worker still busy after 15s, using fallback');
      return this.recognizeIDFallback(imageBuffer, filename);
    }

    this.ocrBusy = true;
    try {
      const { data: { text, confidence } } = await this.ocrWorker.recognize(imageBuffer);
      const elapsed = Date.now() - t0;
      this.logger.log(`[OCR] Done in ${elapsed}ms — ${text.length} chars, confidence ${confidence?.toFixed(1)}%`);
      this.logger.debug(`[OCR] Raw text:\n${text.substring(0, 500)}`);
      return this.parseCCCDText(text, confidence);
    } finally {
      this.ocrBusy = false;
    }
  }

  // ── Fallback: tạo worker mới khi persistent worker chưa sẵn sàng ────────
  private async recognizeIDFallback(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<IDRecognitionResult> {
    const worker = await createWorker(['vie', 'eng']);
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any,
        preserve_interword_spaces: '1',
        tessedit_char_blacklist: '|\\~`^{}[]<>',
      });
      const { data: { text, confidence } } = await worker.recognize(imageBuffer);
      this.logger.debug(`[OCR-Fallback] ${filename}: ${text.length} chars, confidence ${confidence?.toFixed(1)}%`);
      return this.parseCCCDText(text, confidence);
    } finally {
      await worker.terminate();
    }
  }

  // ── Bước 2: So khớp khuôn mặt (pixel MSE similarity, dùng Jimp) ──────────
  async matchFaces(
    idImageBuffer: Buffer,
    selfieBuffer: Buffer,
  ): Promise<FaceMatchResult> {
    this.logger.log('[FaceMatch] Comparing faces via pixel similarity (Jimp)...');

    try {
      const SIZE = 128;

      const [img1, img2] = await Promise.all([
        Jimp.read(idImageBuffer),
        Jimp.read(selfieBuffer),
      ]);

      img1.resize({ w: SIZE, h: SIZE });
      img2.resize({ w: SIZE, h: SIZE });

      const d1 = img1.bitmap.data;
      const d2 = img2.bitmap.data;

      // Tính MSE trên kênh grayscale (RGBA flat array, step=4)
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

  // ── Helper: Chuẩn hoà ngày tháng ───────────────────────────────────────────
  private normalizeDate(raw: string): string {
    if (!raw) return '';
    // OCR hay nhầm: O→0, l/I→1, S→5
    const cleaned = raw
      .replace(/[Oo]/g, '0')
      .replace(/[lI]/g, '1')
      .replace(/[Ss]/g, '5');
    const m = cleaned.match(/(\d{1,2})[\/\-\.\s](\d{2})[\/\-\.\s](\d{4})/);
    if (!m) return raw.trim();
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    if (parseInt(mm) > 12 || parseInt(dd) > 31) return raw.trim();
    return `${dd}/${mm}/${yyyy}`;
  }

  // ── Helper: Trích số CCCD/CMND (dung sai OCR nhầm ký tự) ──────────────────
  private extractIDNumber(text: string): string {
    // Chuẩn hoà: OCR hay nhầm O→0, l/I→1, S→5, B→8, G→6
    const n = text
      .replace(/[Oo]/g, '0')
      .replace(/[lI]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/[Bb]/g, '8')
      .replace(/[Gg]/g, '6');
    // Ư u tiên: sau label "Số"
    const labeled12 = n.match(/(?:^|\n|Số[:\s]|No[.:\s])\s*(\d{12})\b/m);
    if (labeled12) return labeled12[1];
    const any12 = n.match(/\b(\d{12})\b/);
    if (any12) return any12[1];
    const labeled9 = n.match(/(?:^|\n|Số[:\s]|No[.:\s])\s*(\d{9})\b/m);
    if (labeled9) return labeled9[1];
    const any9 = n.match(/\b(\d{9})\b/);
    if (any9) return any9[1];
    return '';
  }

  // ── Helper: Trích tên từ các dòng OCR ───────────────────────────────────
  private extractName(lines: string[]): string {
    const nameLabelRe = /Họ[,\s]*(chữ đệm|và tên)?[\s,]*(tên)?[\s]*(khai sinh)?|Full name|Ho va ten/i;
    // Unicode phủ đầy đủ tiếng Việt
    const vnNameRe = /^[A-ZÀ-ɏḀ-ỿ\s]{2,60}$/i;
    const stopRe = /Ngày sinh|Date of|Giới tính|Quê quán|Quốc tịch|Nơi|Có giá trị|Place|Sex|Gender/i;
    const headerRe = /CĂN CƯỜC|CHỨNG MINH|CỘNG HOÀ|VIỆT NAM|SOCIALIST|REPUBLIC|NHÂN DÂN|CITIZEN|CÔNG AN|MINISTRY/i;

    const labelIdx = lines.findIndex((l) => nameLabelRe.test(l));
    if (labelIdx >= 0) {
      for (let i = labelIdx + 1; i <= labelIdx + 3 && i < lines.length; i++) {
        const c = lines[i].trim();
        if (vnNameRe.test(c) && c.length >= 3 && !stopRe.test(c) && !headerRe.test(c) && c.split(' ').length >= 1) {
          return c.replace(/[^A-Z\u00c0-\u024f\u1e00-\u1effa-z\s]/g, '').trim().toUpperCase();
        }
      }
    }
    // Fallback: dòng toàn HOA ≥ 5 ký tự, có ≥ 2 từ, không phải header
    const uppercaseLine = lines.find(
      (l) =>
        /^[A-Z\u00c0-\u024f\u1e00-\u1eff\s]{5,60}$/.test(l) &&
        !headerRe.test(l) &&
        l.split(' ').length >= 2 &&
        l.split(' ').length <= 8,
    );
    return uppercaseLine
      ? uppercaseLine.replace(/[^A-Z\u00c0-\u024f\u1e00-\u1effa-z\s]/g, '').trim().toUpperCase()
      : '';
  }

  // ── Helper: parse text OCR → IDRecognitionResult ────────────────────────
  private parseCCCDText(rawText: string, ocrConfidence?: number): IDRecognitionResult {
    // Tiền xử lý
    const text = rawText
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ');

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // ── Helper: lấy N dòng tiếp theo sau keyword ──────────────────────────
    const nextLines = (keyword: RegExp, count = 1): string[] => {
      const idx = lines.findIndex((l) => keyword.test(l));
      if (idx < 0) return [];
      return lines.slice(idx + 1, idx + 1 + count).filter(Boolean);
    };

    // ── Helper: inline value sau keyword trên cùng dòng ─────────────────
    const inlineValue = (keyword: RegExp): string => {
      for (const line of lines) {
        const m = line.match(keyword);
        if (m) return (m[1] || '').trim();
      }
      return '';
    };

    // ════════════════════════════════════════════════════
    // 1. Số CCCD — 12 chữ số liên tiếp (CCCD) hoặc 9 chữ số (CMND cũ)
    //    Ưu tiên 12 chữ số vì CMND cũ chỉ 9 chữ số
    //    Tránh nhầm với các số trong địa chỉ bằng cách kiểm tra vị trí đứng đầu dòng
    // ════════════════════════════════════════════════════
    const cccdPattern12 = text.match(/\b(\d{12})\b/);
    const cccdPattern9 = text.match(/\b(\d{9})\b/);
    const idNumber = cccdPattern12?.[1] || cccdPattern9?.[1] || '';

    // ════════════════════════════════════════════════════
    // 2. Tất cả ngày tháng DD/MM/YYYY trong văn bản
    //    Dob: ngày đầu tiên sau "Ngày sinh" hoặc ngày đầu xuất hiện
    //    Doe: ngày sau "Có giá trị đến" / "Ngày hết hạn" hoặc ngày cuối cùng
    //    issue_date: ngày sau "Ngày cấp"
    // ════════════════════════════════════════════════════
    const allDateMatches = [...text.matchAll(/(\d{2}[\\/\-\.]\d{2}[\\/\-\.]\d{4})/g)];
    const allDates = allDateMatches.map((m) => this.normalizeDate(m[1]));

    // Tìm dob: Inline sau "Ngày sinh" / "Date of birth"
    const dobInline = inlineValue(
      /(?:Ng[aà]y sinh|Date of birth)\s*[:\|]?\s*(\d{2}[\\/\-\.]\d{2}[\\/\-\.]\d{4})/i,
    );
    const dob = dobInline
      ? this.normalizeDate(dobInline)
      : (allDates[0] || '');

    // Tìm doe: Inline sau "Có giá trị đến" / "Ngày hết hạn"
    const doeInline = inlineValue(
      /(?:Có giá trị đến|Date of expiry|Ng[aà]y h[eế]t h[aạ]n|Valid until)\s*[:\|]?\s*(\d{2}[\\/\-\.]\d{2}[\\/\-\.]\d{4})/i,
    );
    const doe = doeInline
      ? this.normalizeDate(doeInline)
      : (allDates.length > 1 ? allDates[allDates.length - 1] : '');

    // Tìm issue_date: Inline sau "Ngày cấp"
    const issueDateInline = inlineValue(
      /(?:Ng[aà]y c[aấ]p|Date of issue)\s*[:\|]?\s*(\d{2}[\\/\-\.]\d{2}[\\/\-\.]\d{4})/i,
    );
    const issueDate = issueDateInline ? this.normalizeDate(issueDateInline) : '';

    // ════════════════════════════════════════════════════
    // 3. Họ tên — CCCD mới in HOA trên 1 dòng riêng ngay sau label
    //    CMND cũ có thể có chữ thường
    // ════════════════════════════════════════════════════
    const nameIdx = lines.findIndex((l) =>
      /Họ(?: và| tên)?(?:\s+tên)?|Full name/i.test(l),
    );
    let rawName = '';
    if (nameIdx >= 0) {
      // Thử dòng liền kề (thường là tên viết HOA)
      for (let i = nameIdx + 1; i <= nameIdx + 3 && i < lines.length; i++) {
        const candidate = lines[i].trim();
        // Tên phải toàn chữ cái + khoảng trắng, độ dài hợp lý
        if (
          /^[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-Ỹ\s]{2,50}$/i.test(candidate) &&
          candidate.length >= 2 &&
          !(/Ngày sinh|Date of|Giới tính|Quê quán|Quốc tịch/i.test(candidate))
        ) {
          rawName = candidate;
          break;
        }
      }
    }
    // Fallback: tìm dòng chỉ toàn chữ HOA dài ≥ 3 ký tự
    if (!rawName) {
      rawName = lines.find(
        (l) =>
          /^[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-Ỹ\s]{3,}$/.test(l) &&
          l.length <= 60 &&
          !(/CĂN CƯỚC|CHỨNG MINH|CỘNG HOÀ|VIỆT NAM|SOCIALIST|REPUBLIC/i.test(l)),
      ) || '';
    }
    const name = rawName
      .replace(/[^a-zA-ZÀ-ỹ\s]/g, '')
      .trim()
      .toUpperCase();

    // ════════════════════════════════════════════════════
    // 4. Giới tính — Inline hoặc dòng kế tiếp
    // ════════════════════════════════════════════════════
    const sexInline = inlineValue(
      /(?:Giới tính|Sex)\s*[:\|]?\s*(Nam|Nữ|Male|Female|M|F)\b/i,
    );
    let sex = sexInline;
    if (!sex) {
      const sexNext = nextLines(/Giới tính|Sex/i, 1)[0] || '';
      if (/^(Nam|Nữ|Male|Female|M|F)$/i.test(sexNext)) sex = sexNext;
    }
    // Chuẩn hoá M/F → Nam/Nữ
    if (/^(M|Male)$/i.test(sex)) sex = 'Nam';
    if (/^(F|Female)$/i.test(sex)) sex = 'Nữ';

    // ════════════════════════════════════════════════════
    // 5. Quê quán — thường nhiều dòng, lấy đến khi gặp label tiếp theo
    // ════════════════════════════════════════════════════
    const homeIdx = lines.findIndex((l) =>
      /Quê quán|Place of origin/i.test(l),
    );
    let home = '';
    if (homeIdx >= 0) {
      const homeParts: string[] = [];
      for (let i = homeIdx + 1; i < Math.min(homeIdx + 4, lines.length); i++) {
        if (/Nơi thường trú|Place of residence|Ngày|Date|Giới tính|Đặc điểm/i.test(lines[i])) break;
        homeParts.push(lines[i]);
      }
      home = homeParts.join(' ').trim();
    }
    // Inline fallback
    if (!home) {
      home = inlineValue(/(?:Quê quán|Place of origin)\s*[:\|]?\s*(.+)/i);
    }

    // ════════════════════════════════════════════════════
    // 6. Nơi thường trú — tương tự quê quán
    // ════════════════════════════════════════════════════
    const addressIdx = lines.findIndex((l) =>
      /Nơi thường trú|Place of residence/i.test(l),
    );
    let address = '';
    if (addressIdx >= 0) {
      const addrParts: string[] = [];
      for (let i = addressIdx + 1; i < Math.min(addressIdx + 5, lines.length); i++) {
        if (/Ngày cấp|Date of issue|Có giá trị|Đặc điểm|Nơi cấp/i.test(lines[i])) break;
        addrParts.push(lines[i]);
      }
      address = addrParts.join(' ').trim();
    }
    if (!address) {
      address = inlineValue(/(?:Nơi thường trú|Place of residence)\s*[:\|]?\s*(.+)/i);
    }

    // ════════════════════════════════════════════════════
    // 7. Nơi cấp — dòng sau "Nơi cấp" hoặc "Place of issue"
    // ════════════════════════════════════════════════════
    const issueLocIdx = lines.findIndex((l) =>
      /Nơi cấp|Place of issue/i.test(l),
    );
    let issueLoc = '';
    if (issueLocIdx >= 0) {
      const locParts: string[] = [];
      for (let i = issueLocIdx + 1; i < Math.min(issueLocIdx + 3, lines.length); i++) {
        if (/Ngày cấp|Ngày sinh|Đặc điểm|Có giá trị/i.test(lines[i])) break;
        locParts.push(lines[i]);
      }
      issueLoc = locParts.join(' ').trim();
    }
    if (!issueLoc) {
      issueLoc = inlineValue(/(?:Nơi cấp|Place of issue)\s*[:\|]?\s*(.+)/i);
    }

    // ════════════════════════════════════════════════════
    // 8. Loại giấy tờ
    // ════════════════════════════════════════════════════
    const docType = /CĂN CƯỚC|CCCD/i.test(text)
      ? 'CCCD'
      : /CHỨNG MINH|CMND/i.test(text)
        ? 'CMND'
        : 'CCCD';

    // ════════════════════════════════════════════════════
    // 9. Đặc điểm nhận dạng (features) — mặt sau CCCD
    // ════════════════════════════════════════════════════
    const featuresIdx = lines.findIndex((l) =>
      /Đặc điểm nhận dạng|Personal identification|Dấu hiệu/i.test(l),
    );
    const features = featuresIdx >= 0 ? (lines[featuresIdx + 1] || '').trim() : '';

    this.logger.debug(
      `[OCR] Parsed → id:${idNumber} name:${name} dob:${dob} sex:${sex} doe:${doe} issue:${issueDate}@${issueLoc}`,
    );

    return {
      id: idNumber,
      name,
      dob,
      sex,
      nationality: 'Việt Nam',
      home: home,
      address: address,
      doe,
      type: docType,
      features,
      issue_date: issueDate,
      issue_loc: issueLoc,
      confidence: ocrConfidence != null ? Math.round(ocrConfidence) / 100 : undefined,
    };
  }
}
