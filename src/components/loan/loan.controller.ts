import { LoanService } from "./loan.service";
import { LenderMarketplaceService } from "./lender-marketplace.service";
import { DisbursementService } from "./disbursement.service";
import { LiquidationService } from "./liquidation.service";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { RoleGuard } from "@core/guards/role.guard";
import { Roles } from "@core/decorators/roles.decorator";
import { ROLE_ENUM } from "@constant/p2p-lending.enum";
import { CreateLoanRequestDto } from "./dto/create-loan-request.dto";
import { FundLoanDto } from "./dto/fund-loan.dto";
import { RepayLoanDto } from "./dto/repay-loan.dto";
import { BlockchainService } from "../blockchain/blockchain.service";
import { NotificationService } from "../notification/notification.service";

@ApiTags('Loans')
@ApiBearerAuth('access-token')
@Controller('loans')
export class LoanController {
    constructor(
        private readonly loanService: LoanService,
        private readonly blockchainService: BlockchainService,
        private readonly marketplaceService: LenderMarketplaceService,
        private readonly disbursementService: DisbursementService,
        private readonly liquidationService: LiquidationService,
        private readonly notificationService: NotificationService,
    ) { }

    // ========================================
    // === LOAN REQUESTS (Borrower) ===
    // ========================================

    @Post('requests')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Tạo yêu cầu vay mới' })
    async createRequest(@Request() req, @Body() dto: any) {
        const data = dto.request || dto;
        return this.loanService.createLoanRequest(req.user._id, data);
    }

    @Get('requests')
    @ApiOperation({ summary: 'Danh sách yêu cầu vay của tôi' })
    async getMyRequests(@Request() req) {
        return this.loanService.getMyLoanRequests(req.user._id);
    }

    @Get('requests/pending')
    @ApiOperation({ summary: 'Danh sách yêu cầu vay đang chờ (marketplace cơ bản)' })
    @ApiQuery({ name: 'minAmount', required: false, type: Number })
    @ApiQuery({ name: 'maxAmount', required: false, type: Number })
    @ApiQuery({ name: 'minRate', required: false, type: Number })
    @ApiQuery({ name: 'maxRate', required: false, type: Number })
    @ApiQuery({ name: 'purpose', required: false, type: String })
    async getPendingRequests(@Query() filters) {
        return this.loanService.getPendingRequests(filters);
    }

    @Get('requests/:id')
    @ApiOperation({ summary: 'Chi tiết yêu cầu vay' })
    async getRequestDetail(@Param('id') id: string) {
        return this.loanService.getLoanRequestDetail(id);
    }

    @Put('requests/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cập nhật yêu cầu vay (chỉ khi pending)' })
    async updateRequest(@Request() req, @Param('id') id: string, @Body() dto: any) {
        const data = dto.request || dto;
        return this.loanService.updateLoanRequest(req.user._id, id, data);
    }

    @Delete('requests/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xóa/Hủy yêu cầu vay' })
    async deleteRequest(@Request() req, @Param('id') id: string) {
        return this.loanService.cancelLoanRequest(req.user._id, id);
    }

    @Post('requests/:id/cancel')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Hủy yêu cầu vay' })
    async cancelRequest(@Request() req, @Param('id') id: string) {
        return this.loanService.cancelLoanRequest(req.user._id, id);
    }

    // ========================================
    // === LOANS ===
    // ========================================

    @Get()
    @ApiOperation({ summary: 'Danh sách khoản vay của tôi (borrower + lender)' })
    async getMyLoans(@Request() req) {
        return this.loanService.getMyLoans(req.user._id);
    }

    @Get('stats')
    @ApiOperation({ summary: 'Thống kê khoản vay (admin)' })
    async getLoanStats() {
        return this.loanService.getLoanStats();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Chi tiết khoản vay (bao gồm on-chain status)' })
    async getLoanDetail(@Param('id') id: string) {
        return this.loanService.getLoanDetail(id);
    }

    // ========================================
    // === ACTIONS ===
    // ========================================

    @Post('requests/:id/fund')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cấp vốn cho khoản vay' })
    async fundLoan(@Request() req, @Param('id') id: string, @Body() dto: any) {
        const data = dto.request || dto;
        return this.loanService.fundLoan(req.user._id, id, data);
    }

    @Post(':id/repay')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Trả nợ' })
    async repayLoan(@Request() req, @Param('id') id: string, @Body() dto: any) {
        const data = dto.request || dto;
        return this.loanService.repayLoan(req.user._id, id, data);
    }

    // ========================================
    // === ENHANCED MARKETPLACE (Bước 3) ===
    // ========================================

    @Get('marketplace/explore')
    @ApiOperation({ summary: 'Marketplace nâng cao — Loan requests kèm risk metrics & credit score' })
    @ApiQuery({ name: 'minAmount', required: false, type: Number })
    @ApiQuery({ name: 'maxAmount', required: false, type: Number })
    @ApiQuery({ name: 'minRate', required: false, type: Number })
    @ApiQuery({ name: 'maxRate', required: false, type: Number })
    @ApiQuery({ name: 'riskLevel', required: false, enum: ['LOW', 'MEDIUM', 'HIGH'] })
    @ApiQuery({ name: 'sortBy', required: false, enum: ['rate', 'amount', 'risk', 'return'] })
    @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
    async exploreMarketplace(@Request() req, @Query() filters) {
        return this.marketplaceService.getEnrichedMarketplace(req.user._id, filters);
    }

    @Get('marketplace/recommendations')
    @ApiOperation({ summary: 'Gợi ý khoản vay phù hợp dựa trên lịch sử đầu tư' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getRecommendations(@Request() req, @Query('limit') limit?: string) {
        return this.marketplaceService.getRecommendedLoans(req.user._id, Number(limit) || 5);
    }

    @Get('marketplace/risk/:id')
    @ApiOperation({ summary: 'Risk assessment chi tiết cho 1 loan request (trước khi fund)' })
    async getRiskAssessment(@Param('id') id: string) {
        return this.marketplaceService.getLoanRequestRiskAssessment(id);
    }

    // ========================================
    // === INVESTMENTS (Lender) ===
    // ========================================

    @Get('investments/my')
    @ApiOperation({ summary: 'Danh sách đầu tư của tôi' })
    async getMyInvestments(@Request() req) {
        return this.loanService.getMyInvestments(req.user._id);
    }

    @Get('investments/portfolio')
    @ApiOperation({ summary: 'Portfolio analytics — Tổng quan danh mục đầu tư' })
    async getPortfolio(@Request() req) {
        return this.marketplaceService.getLenderPortfolioSummary(req.user._id);
    }

    @Get('transactions/my')
    @ApiOperation({ summary: 'Lịch sử giao dịch gần đây của tôi' })
    async getMyTransactions(@Request() req) {
        return this.loanService.getMyTransactions(req.user._id);
    }

    // ========================================
    // === DISBURSEMENT / OFF-RAMP (Bước 3) ===
    // ========================================

    @Get(':id/disbursement')
    @ApiOperation({ summary: 'Hướng dẫn giải ngân — Off-ramp từ crypto về ngân hàng' })
    async getDisbursementInstructions(@Request() req, @Param('id') id: string) {
        return this.disbursementService.createDisbursementInstructions(req.user._id, id);
    }

    @Get(':id/disbursement/status')
    @ApiOperation({ summary: 'Trạng thái giải ngân tổng hợp (on-chain + off-ramp)' })
    async getDisbursementStatus(@Param('id') id: string) {
        return this.disbursementService.getDisbursementStatus(id);
    }

    // ========================================
    // === LIQUIDATION & DEBT (Bước 4) ===
    // ========================================

    // ========================================
    // === ADMIN — User-specific queries ===
    // ========================================

    @Get('admin/user/:userId/loans')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[Admin] Danh sách khoản vay của một user cụ thể' })
    async getAdminUserLoans(@Param('userId') userId: string) {
        return this.loanService.getMyLoans(userId);
    }

    @Get('admin/user/:userId/requests')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[Admin] Danh sách yêu cầu vay của một user cụ thể' })
    async getAdminUserRequests(@Param('userId') userId: string) {
        return this.loanService.getMyLoanRequests(userId);
    }

    @Get('admin/user/:userId/transactions')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[Admin] Lịch sử giao dịch của một user cụ thể' })
    async getAdminUserTransactions(@Param('userId') userId: string) {
        return this.loanService.getMyTransactions(userId);
    }

    @Get('admin/overdue-report')
    @ApiOperation({ summary: '[Admin] Báo cáo khoản vay quá hạn / nợ xấu' })
    async getOverdueReport() {
        return this.liquidationService.getOverdueReport();
    }

    @Post('admin/test/trigger-due-notifications')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[TEST] Trigger thủ công cron nhắc sắp đến hạn' })
    async triggerDueNotifications() {
        await this.notificationService.handleCronCheckApproachingDeadlines();
        return { success: true, message: 'Due-soon notification scan triggered' };
    }

    @Post('admin/test/trigger-liquidation-scan')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[TEST] Trigger thủ công cron quét quá hạn / thanh lý' })
    async triggerLiquidationScan() {
        await this.liquidationService.scanOverdueLoans();
        return { success: true, message: 'Liquidation scan triggered' };
    }

    @Post('admin/test/set-loan-due/:loanId')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[TEST] Đặt dueDate & status của loan để test' })
    async setLoanDueForTest(
        @Param('loanId') loanId: string,
        @Body() body: { daysOffset: number; status?: string },
    ) {
        return this.loanService.setLoanDueForTest(loanId, body.daysOffset, body.status);
    }

    @Post('admin/test/mint-debt-token/:loanId')
    @UseGuards(RoleGuard)
    @Roles(ROLE_ENUM.ADMIN, ROLE_ENUM.SUPER_ADMIN)
    @ApiOperation({ summary: '[TEST] Mint DebtToken trực tiếp cho loan (bỏ qua kiểm tra ngày)' })
    async mintDebtTokenDirect(@Param('loanId') loanId: string) {
        const loan = await this.loanService.getLoanDetail(loanId);
        const txHash = await this.liquidationService.mintDebtTokenOnChain(loan);
        return {
            success: !!txHash,
            txHash: txHash ?? null,
            message: txHash
                ? `DebtToken đã mint! Tx: ${txHash}`
                : 'Mint thất bại hoặc DebtToken contract chưa config (xem log backend)',
        };
    }

    @Get('debt/check/:walletAddress')
    @ApiOperation({ summary: 'Kiểm tra DebtToken (nợ xấu on-chain) của borrower' })
    async checkDebtTokens(@Param('walletAddress') walletAddress: string) {
        return this.liquidationService.checkBorrowerDebtTokens(walletAddress);
    }

    @Get(':id/repayment-schedule')
    @ApiOperation({ summary: 'Lịch trả nợ theo kỳ (installments) cho khoản vay' })
    @ApiQuery({ name: 'installments', required: false, type: Number, description: 'Số kỳ (0 = tự tính theo tháng)' })
    async getRepaymentSchedule(@Param('id') id: string, @Query('installments') installments?: string) {
        const loan = await this.loanService.getLoanDetail(id);
        return this.liquidationService.generateRepaymentSchedule(
            loan.principalAmount,
            loan.interestRate,
            loan.durationDays,
            new Date(loan.startDate || loan.createdAt),
            Number(installments) || 0,
        );
    }

    // ========================================
    // === OPEN BANKING INTEGRATION ===
    // ========================================

    @Get(':id/repay-qr')
    @ApiOperation({ summary: 'Tạo QR Code trả nợ qua Open Banking (VietQR)' })
    async getRepaymentQR(@Request() req, @Param('id') id: string) {
        return this.loanService.generateRepaymentQR(req.user._id, id);
    }

    @Get(':id/bank-info')
    @ApiOperation({ summary: 'Thông tin ngân hàng liên kết của borrower/lender' })
    async getLoanBankInfo(@Request() req, @Param('id') id: string) {
        return this.loanService.getLoanBankInfo(req.user._id, id);
    }

    // ========================================
    // === BLOCKCHAIN ===
    // ========================================

    @Get('blockchain/status')
    @ApiOperation({ summary: 'Trạng thái kết nối blockchain' })
    async getBlockchainStatus() {
        return this.blockchainService.getBlockchainStats();
    }

    @Get('blockchain/pending')
    @ApiOperation({ summary: 'Danh sách pending requests on-chain' })
    async getOnChainPendingRequests() {
        return this.blockchainService.getPendingRequests();
    }

    @Get('blockchain/contract-info')
    @ApiOperation({ summary: 'Thông tin platform contract' })
    async getContractInfo() {
        return this.blockchainService.getContractInfo();
    }

    @Get('blockchain/loan/:address')
    @ApiOperation({ summary: 'Trạng thái on-chain của khoản vay' })
    async getLoanOnChainStatus(@Param('address') address: string) {
        return this.blockchainService.getLoanOnChainStatus(address);
    }

    @Get('blockchain/tx/:txHash')
    @ApiOperation({ summary: 'Verify giao dịch blockchain' })
    async verifyTransaction(@Param('txHash') txHash: string) {
        return this.blockchainService.verifyTransaction(txHash);
    }

    @Post('blockchain/sync/:loanId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Đồng bộ trạng thái khoản vay từ blockchain' })
    async syncLoanStatus(@Param('loanId') loanId: string) {
        const result = await this.blockchainService.syncLoanStatus(loanId);
        return { success: result, message: result ? 'Đồng bộ thành công' : 'Không thể đồng bộ' };
    }

    @Post('blockchain/sync-all')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Đồng bộ tất cả khoản vay active từ blockchain' })
    async syncAllLoans() {
        return this.blockchainService.syncAllActiveLoans();
    }
}

