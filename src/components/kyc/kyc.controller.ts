import {
  Controller,
  Post,
  Get,
  Request,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FptAiService, IDRecognitionResult } from './fptai.service';
import { KycService } from './kyc.service';

@ApiTags('KYC - Xác thực danh tính')
@Controller('kyc')
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(
    private readonly fptAiService: FptAiService,
    private readonly kycService: KycService,
  ) { }

  /**
   * Bước 1: Upload ảnh CMND/CCCD → FPT.AI OCR → Lưu kết quả vào MongoDB
   */
  @Post('recognize-id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'OCR nhận dạng CMND/CCCD qua FPT.AI' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary', description: 'Ảnh CMND/CCCD' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpeg|png|jpg|webp)$/)) {
        cb(new BadRequestException('Chỉ chấp nhận ảnh JPEG/PNG'), false);
      } else {
        cb(null, true);
      }
    },
  }))
  async recognizeID(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chụp ảnh CMND/CCCD');
    }

    const userId = req.user?._id?.toString() || req.user?.id;
    this.logger.log(`Received ID image: ${file.originalname}, ${file.size} bytes - User: ${userId}`);

    const result = await this.fptAiService.recognizeID(file.buffer, file.originalname);

    // Lưu kết quả OCR vào MongoDB (thay vì chỉ trả về)
    if (userId) {
      await this.kycService.saveIDResult(userId, result);
      this.logger.log(`KYC Step 1 completed: ID verified for user ${userId}`);
    }

    return {
      success: true,
      message: 'Nhận dạng thành công',
      data: result,
    };
  }

  /**
   * Bước 2: Upload ảnh selfie + ảnh khuôn mặt từ CMND → So sánh → Lưu kết quả
   */
  @Post('face-match')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'So khớp khuôn mặt (ảnh CMND vs selfie)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        'files': {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'files[0] = ảnh CMND, files[1] = ảnh selfie',
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 2, {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpeg|png|jpg|webp)$/)) {
        cb(new BadRequestException('Chỉ chấp nhận ảnh JPEG/PNG'), false);
      } else {
        cb(null, true);
      }
    },
  }))
  async matchFaces(
    @Request() req,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length < 2) {
      throw new BadRequestException('Cần 2 ảnh: ảnh CMND và ảnh selfie');
    }

    const userId = req.user?._id?.toString() || req.user?.id;
    const [idImage, selfieImage] = files;
    this.logger.log(
      `Face match: ID=${idImage.originalname} (${idImage.size}), Selfie=${selfieImage.originalname} (${selfieImage.size}) - User: ${userId}`,
    );

    const result = await this.fptAiService.matchFaces(idImage.buffer, selfieImage.buffer);

    // Lưu kết quả face match vào MongoDB
    if (userId) {
      await this.kycService.saveFaceMatchResult(userId, result.similarity, result.isMatch);
      this.logger.log(`KYC Step 2 completed: Face match ${result.isMatch ? 'PASSED' : 'FAILED'} for user ${userId}`);
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

  /**
   * Bước 3: Hoàn tất KYC - cập nhật trạng thái COMPLETED trong MongoDB
   */
  @Post('complete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hoàn tất xác thực KYC' })
  async completeKYC(@Request() req) {
    const userId = req.user?._id?.toString() || req.user?.id;

    if (!userId) {
      throw new BadRequestException('Không xác định được user. Vui lòng đăng nhập lại.');
    }

    // Kiểm tra user đã qua đủ các bước chưa
    const currentStatus = await this.kycService.getKYCStatus(userId);
    if (currentStatus.status === 'NOT_STARTED') {
      throw new BadRequestException('Bạn chưa thực hiện xác thực CMND/CCCD (Bước 1)');
    }

    this.logger.log(`KYC Step 3: Completing KYC for user ${userId} (current: ${currentStatus.status})`);
    return this.kycService.completeKYC(userId);
  }

  /**
   * Kiểm tra trạng thái KYC hiện tại
   */
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
      };
    }

    return this.kycService.getKYCStatus(userId);
  }
}
