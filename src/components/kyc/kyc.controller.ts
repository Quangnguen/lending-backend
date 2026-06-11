import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { LocalKycService } from './local-kyc.service';
import { KycService } from './kyc.service';
import { KycCloudinaryService } from './kyc-cloudinary.service';
import { KYC_STEP_STATUS } from '@database/schemas/kyc-record.model';
import { RoleGuard } from '@core/guards/role.guard';
import { Roles } from '@core/decorators/roles.decorator';
import { ROLE_ENUM } from '@constant/p2p-lending.enum';

// ── Multer: giữ ảnh trong RAM (không ghi disk) ──────────────────────────────
const imageMemoryStorage = memoryStorage();

const imageFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (!file.mimetype.match(/^image\/(jpeg|png|jpg|webp)$/)) {
    cb(new BadRequestException('Chỉ chấp nhận ảnh JPEG/PNG/WebP'), false);
  } else {
    cb(null, true);
  }
};

@ApiTags('KYC - Xác thực danh tính')
@Controller('kyc')
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly localKycService: LocalKycService,
    private readonly kycService: KycService,
    private readonly kycCloudinaryService: KycCloudinaryService,
  ) { }

  // ─── Bước 1: Upload ảnh CCCD → OCR → Upload Cloudinary → Lưu kết quả ────
  @Post('recognize-id')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'OCR nhận dạng CMND/CCCD và lưu ảnh lên Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary', description: 'Ảnh CMND/CCCD' },
        imageType: { type: 'string', enum: ['front', 'back'], description: 'Mặt trước hay mặt sau' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    storage: imageMemoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: imageFilter,
  }))
  async recognizeID(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('imageType') imageType: 'front' | 'back' = 'front',
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng chụp ảnh CMND/CCCD');
    }

    const userId = req.user?._id?.toString() || req.user?.id;
    this.logger.log(
      `[KYC Step 1] Nhận ảnh ${imageType}: ${file.originalname} (${file.size} bytes) — User: ${userId}`,
    );

    // 1. OCR nhận dạng (từ buffer trong RAM)
    const result = await this.localKycService.recognizeID(file.buffer, file.originalname);

    // 2. Nếu là mặt trước và OCR lấy được số CCCD → kiểm tra trùng NGAY
    //    Làm trước upload Cloudinary để không lưu ảnh của người dùng bất hợp lệ
    if (imageType === 'front' && userId && result.id && result.id.length >= 9) {
      await this.kycService.checkDuplicateCCCD(result.id, userId);
      this.logger.log(`[KYC Step 1] ✅ CCCD ${result.id} — no duplicate found`);
    }

    // 3. Upload lên Cloudinary (private)
    let imageUrl: string | null = null;
    if (userId) {
      try {
        const cloudinaryType = imageType === 'back' ? 'id_back' : 'id_front';
        imageUrl = await this.kycCloudinaryService.uploadKYCImage(
          file.buffer,
          userId,
          cloudinaryType,
        );
        this.logger.log(`[KYC Step 1] ✅ Uploaded to Cloudinary: ${imageUrl}`);
      } catch (uploadErr) {
        this.logger.error(`[KYC Step 1] ❌ Cloudinary upload failed: ${uploadErr.message}`);
      }
    }

    // 4. Lưu kết quả OCR + URL ảnh vào MongoDB
    if (userId) {
      await this.kycService.saveIDResult(userId, result, imageUrl, imageType);
      this.logger.log(`[KYC Step 1] ✅ ID result saved for user ${userId} (${imageType})`);
    }

    return {
      success: true,
      message: 'Nhận dạng thành công',
      data: result,
      imageUrl,
    };
  }

  // ─── Bước 2: Upload selfie + CCCD → So khớp mặt → Upload Cloudinary ───────
  @Post('face-match')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'So khớp khuôn mặt và lưu ảnh selfie lên Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'files[0] = ảnh CCCD mặt trước, files[1] = ảnh selfie',
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 2, {
    storage: imageMemoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: imageFilter,
  }))
  async matchFaces(
    @Request() req,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length < 2) {
      throw new BadRequestException('Cần 2 ảnh: ảnh CCCD và ảnh selfie');
    }

    const userId = req.user?._id?.toString() || req.user?.id;
    const [idImage, selfieImage] = files;

    this.logger.log(
      `[KYC Step 2] Face match: ID=${idImage.originalname} (${idImage.size}B), Selfie=${selfieImage.originalname} (${selfieImage.size}B) — User: ${userId}`,
    );

    // 1. So khớp khuôn mặt (từ buffer trong RAM)
    const result = await this.localKycService.matchFaces(idImage.buffer, selfieImage.buffer);

    // 2. Tính perceptual hash của selfie (để phát hiện trùng mặt xuyên tài khoản)
    const selfieHash = result.isMatch
      ? await this.localKycService.computePerceptualHash(selfieImage.buffer)
      : '';

    // 3. Upload selfie lên Cloudinary (dù match hay không, để admin xem)
    let selfieUrl: string | null = null;
    if (userId) {
      try {
        selfieUrl = await this.kycCloudinaryService.uploadKYCImage(
          selfieImage.buffer,
          userId,
          'selfie',
        );
        this.logger.log(`[KYC Step 2] ✅ Selfie uploaded to Cloudinary: ${selfieUrl}`);
      } catch (uploadErr) {
        this.logger.error(`[KYC Step 2] ❌ Cloudinary selfie upload failed: ${uploadErr.message}`);
      }
    }

    // 4. Lưu kết quả face match + URL selfie + selfie hash
    if (userId) {
      await this.kycService.saveFaceMatchResult(userId, result.similarity, result.isMatch, selfieUrl, selfieHash);
      this.logger.log(`[KYC Step 2] Face match ${result.isMatch ? 'PASSED ✅' : 'FAILED ❌'} for user ${userId} (${result.similarity.toFixed(1)}%)`);
    }

    return {
      success: result.isMatch,
      message: result.message,
      data: {
        isMatch: result.isMatch,
        similarity: result.similarity,
      },
    };
  }

  // ─── Bước 3: Hoàn tất KYC ────────────────────────────────────────────────
  @Post('complete')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hoàn tất xác thực KYC' })
  async completeKYC(@Request() req) {
    const userId = req.user?._id?.toString() || req.user?.id;

    if (!userId) {
      throw new BadRequestException('Không xác định được user. Vui lòng đăng nhập lại.');
    }

    const currentStatus = await this.kycService.getKYCStatus(userId);
    // BUG-1 FIX: yêu cầu đủ cả bước 1 (ID) lẫn bước 2 (face) trước khi complete
    if (currentStatus.status !== KYC_STEP_STATUS.FACE_VERIFIED) {
      const hint =
        currentStatus.status === KYC_STEP_STATUS.NOT_STARTED
          ? 'Bạn chưa thực hiện xác thực CMND/CCCD (Bước 1)'
          : currentStatus.status === KYC_STEP_STATUS.ID_VERIFIED
            ? 'Bạn chưa hoàn thành xác thực khuôn mặt (Bước 2)'
            : 'Vui lòng hoàn thành đủ cả hai bước xác thực trước khi hoàn tất KYC';
      throw new BadRequestException(hint);
    }

    this.logger.log(`KYC Step 3: Completing KYC for user ${userId} (current: ${currentStatus.status})`);
    return this.kycService.completeKYC(userId);
  }

  // ─── Kiểm tra trạng thái KYC (mobile app) ────────────────────────────────
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra trạng thái KYC' })
  async getKYCStatus(@Request() req) {
    const userId = req.user?._id?.toString() || req.user?.id;

    if (!userId) {
      return {
        status: 'NOT_STARTED',
        idInfo: null,
        faceMatchScore: null,
        completedAt: null,
        reKycReason: null,
      };
    }

    return this.kycService.getKYCStatus(userId);
  }

  // ─── Admin: Lấy chi tiết KYC đầy đủ ─────────────────────────────────────
  @Get('admin/details/:targetId')
  @ApiBearerAuth()
  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Lấy chi tiết KYC record đầy đủ (ảnh + OCR data)' })
  @ApiParam({ name: 'targetId', description: 'ID người dùng cần xem KYC' })
  async getKYCDetails(@Param('targetId') userId: string) {
    return this.kycService.getKYCDetails(userId);
  }

  // ─── Admin: Yêu cầu người dùng xác minh lại ──────────────────────────────
  @Patch('admin/require-reverify/:targetId')
  @ApiBearerAuth()
  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Yêu cầu người dùng xác minh KYC lại' })
  @ApiParam({ name: 'targetId', description: 'ID người dùng cần xác minh lại' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: { type: 'string', description: 'Lý do yêu cầu xác minh lại' },
      },
    },
  })
  async requireReverify(
    @Request() req,
    @Param('targetId') targetUserId: string,
    @Body('reason') reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do yêu cầu xác minh lại.');
    }

    const adminId = req.user?._id?.toString() || req.user?.id;
    return this.kycService.requireReverify(targetUserId, reason.trim(), adminId);
  }

  // ─── Admin: Danh sách KYC chờ duyệt ─────────────────────────────────────
  @Get('admin/pending-list')
  @ApiBearerAuth()
  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Danh sách KYC đang chờ xét duyệt' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingKYCList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.kycService.getPendingKYCList(Number(page) || 1, Number(limit) || 20);
  }

  // ─── Admin: Phê duyệt KYC ────────────────────────────────────────────────
  @Post('admin/approve/:targetId')
  @ApiBearerAuth()
  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Phê duyệt KYC cho người dùng' })
  @ApiParam({ name: 'targetId', description: 'ID người dùng cần duyệt KYC' })
  async approveKYC(
    @Request() req,
    @Param('targetId') targetUserId: string,
    @Body('note') note?: string,
  ) {
    const adminId = req.user?._id?.toString() || req.user?.id;
    return this.kycService.approveKYC(adminId, targetUserId, note);
  }

  // ─── Admin: Từ chối KYC ──────────────────────────────────────────────────
  @Post('admin/reject/:targetId')
  @ApiBearerAuth()
  @UseGuards(RoleGuard)
  @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Từ chối KYC cho người dùng' })
  @ApiParam({ name: 'targetId', description: 'ID người dùng cần từ chối KYC' })
  async rejectKYC(
    @Request() req,
    @Param('targetId') targetUserId: string,
    @Body('reason') reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do từ chối KYC');
    }
    const adminId = req.user?._id?.toString() || req.user?.id;
    return this.kycService.rejectKYC(adminId, targetUserId, reason.trim());
  }
}
