import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { User, UserDocument } from '@database/schemas/user.model';
import { OpenBankingService } from '../openbanking/openbanking.service';
import { VietQRService } from '../openbanking/vietqr.service';
import { LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

/**
 * DisbursementService — Off-ramp: Chuyển tiền từ on-chain → tài khoản ngân hàng
 *
 * Sau khi Lender fund khoản vay trên blockchain (on-chain):
 * 1. Borrower nhận stablecoin (USDT) trên ví
 * 2. Nếu muốn rút VND → dùng Off-ramp qua Open Banking
 * 3. Service này tạo hướng dẫn chuyển khoản / QR Code
 *
 * Luồng off-ramp:
 *   On-chain USDT → (Borrower swap/sell trên exchange) → VND
 *   → Chuyển khoản đến tài khoản NH đã liên kết qua Open Banking
 *
 * Trong phiên bản demo:
 *   - Tạo QR disbursement cho borrower xác nhận đã nhận tiền
 *   - Ghi nhận disbursement record để tracking
 *   - Tạo hướng dẫn rút tiền về NH
 */
@Injectable()
export class DisbursementService {
    private readonly logger = new Logger(DisbursementService.name);

    constructor(
        @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private openBankingService: OpenBankingService,
        private vietQRService: VietQRService,
    ) {}

    /**
     * Tạo hướng dẫn giải ngân cho borrower sau khi loan được fund
     *
     * Flow:
     * 1. Verify loan đã ACTIVE
     * 2. Lấy bank connection của borrower
     * 3. Tạo disbursement instructions + QR Code
     */
    async createDisbursementInstructions(borrowerId: string, loanId: string) {
        // 1. Tìm loan
        let loan = await this.loanModel.findById(loanId)
            .populate('lenderId', 'fullName walletAddress')
            .lean();

        if (!loan) {
            loan = await this.loanModel.findOne({ requestId: new Types.ObjectId(loanId) })
                .populate('lenderId', 'fullName walletAddress')
                .lean();
        }

        if (!loan) throw new NotFoundException('Khoản vay không tồn tại');
        if (loan.borrowerId.toString() !== borrowerId.toString()) {
            throw new BadRequestException('Bạn không phải borrower của khoản vay này');
        }
        if (loan.status !== LOAN_STATUS_ENUM.ACTIVE) {
            throw new BadRequestException(`Khoản vay chưa được giải ngân (status: ${loan.status})`);
        }

        // 2. Lấy bank connection của borrower
        const borrowerBanks = await this.openBankingService.getUserConnections(borrowerId);

        if (!borrowerBanks || borrowerBanks.length === 0) {
            return {
                success: true,
                disbursementMethod: 'CRYPTO_ONLY',
                instructions: {
                    step1: 'Khoản vay đã được giải ngân dưới dạng USDT vào ví của bạn',
                    step2: 'Để rút VND, hãy liên kết tài khoản ngân hàng qua Open Banking',
                    step3: 'Sau đó, bạn có thể đổi USDT → VND qua sàn giao dịch và rút về NH',
                },
                onChainInfo: {
                    loanContractAddress: loan.loanContractAddress,
                    fundTxHash: loan.fundTxHash,
                    principalAmount: `${loan.principalAmount} USDT`,
                },
            };
        }

        // 3. Tạo QR cho off-ramp (VND)
        const primaryBank = borrowerBanks[0];
        const vndAmount = Math.round(loan.principalAmount * 25000); // Demo rate: 1 USDT = 25,000 VND

        let qrData = null;
        try {
            qrData = await this.vietQRService.generateLoanPaymentQR(
                loanId,
                primaryBank.bankCode,
                primaryBank.accountNumberMask.replace('****', '0000'),
                primaryBank.accountName,
                vndAmount,
            );
        } catch (error) {
            this.logger.warn(`Không tạo được QR off-ramp: ${error.message}`);
        }

        // 4. Build complete instructions
        const disbursement = {
            success: true,
            disbursementMethod: 'HYBRID',

            // On-chain info
            onChainDisbursement: {
                status: 'COMPLETED',
                principalAmount: loan.principalAmount,
                currency: 'USDT',
                loanContractAddress: loan.loanContractAddress,
                fundTxHash: loan.fundTxHash,
                lenderWallet: (loan.lenderId as any)?.walletAddress || 'N/A',
            },

            // Off-ramp instructions
            offRampInstructions: {
                bankName: primaryBank.bankName,
                bankLogo: primaryBank.bankLogo,
                accountName: primaryBank.accountName,
                estimatedVndAmount: vndAmount,
                exchangeRate: 25000,
                steps: [
                    `Bạn đã nhận ${loan.principalAmount} USDT trên ví blockchain`,
                    'Bán USDT trên sàn (Binance P2P, Remitano, v.v.) để nhận VND',
                    `Chuyển khoản VND về tài khoản ${primaryBank.bankName} - ${primaryBank.accountName}`,
                    `Số tiền ước tính: ${vndAmount.toLocaleString('vi-VN')} VND`,
                ],
            },

            // QR Code (nếu tạo được)
            qrCode: qrData ? {
                available: true,
                data: qrData,
                description: `QR nhận tiền vào ${primaryBank.bankName}`,
            } : {
                available: false,
                message: 'Không tạo được QR Code, vui lòng chuyển khoản thủ công',
            },

            // Loan summary
            loanSummary: {
                loanId: loan._id,
                principalAmount: loan.principalAmount,
                interestRate: loan.interestRate,
                totalRepayment: loan.totalAmount,
                dueDate: loan.dueDate,
                durationDays: loan.durationDays,
                startDate: loan.startDate,
            },
        };

        this.logger.log(
            `💳 Disbursement instructions created for loan ${loanId}: ` +
            `${loan.principalAmount} USDT → ${primaryBank.bankName}`
        );

        return disbursement;
    }

    /**
     * Lấy trạng thái giải ngân tổng hợp (on-chain + off-ramp)
     */
    async getDisbursementStatus(loanId: string) {
        let loan = await this.loanModel.findById(loanId)
            .populate('borrowerId', 'fullName walletAddress')
            .populate('lenderId', 'fullName walletAddress')
            .lean();

        if (!loan) {
            loan = await this.loanModel.findOne({ requestId: new Types.ObjectId(loanId) })
                .populate('borrowerId', 'fullName walletAddress')
                .populate('lenderId', 'fullName walletAddress')
                .lean();
        }

        if (!loan) throw new NotFoundException('Khoản vay không tồn tại');

        return {
            loanId: loan._id,
            status: loan.status,
            onChain: {
                funded: !!loan.fundTxHash,
                txHash: loan.fundTxHash,
                contractAddress: loan.loanContractAddress,
            },
            amounts: {
                principal: loan.principalAmount,
                totalRepayment: loan.totalAmount,
                amountPaid: loan.amountPaid || 0,
                remaining: loan.remainingAmount || loan.totalAmount,
            },
            timeline: {
                created: loan.createdAt,
                funded: loan.startDate,
                dueDate: loan.dueDate,
                repaidAt: loan.repaidAt,
            },
            participants: {
                borrower: loan.borrowerId,
                lender: loan.lenderId,
            },
        };
    }
}
