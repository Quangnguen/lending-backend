import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ethers } from 'ethers';
import * as P2PLendingArtifact from './P2PLending.json';
import { Loan, LoanDocument } from '@database/schemas/loan.model';
import { LoanRequest, LoanRequestDocument } from '@database/schemas/bank-request.model';
import {
    LOAN_STATUS_ENUM,
    LOAN_REQUEST_STATUS_ENUM,
} from '@constant/p2p-lending.enum';

const P2PLendingABI = P2PLendingArtifact.abi;

// ─── ABI tối giản cho DebtToken contract ──────────────────────────────────
const DebtTokenABI = [
    'function mintDebtToken(address borrower, uint256 loanId, address lender, uint256 principalAmount, uint256 debtAmount, string calldata reason, address loanContract) external returns (uint256 tokenId)',
    'function getDebtCount(address borrower) external view returns (uint256)',
    'function hasDebt(address borrower) external view returns (bool)',
    'function getBorrowerDebtTokens(address borrower) external view returns (uint256[])',
    'event DebtTokenMinted(uint256 indexed tokenId, address indexed borrower, uint256 indexed loanId, uint256 debtAmount, string reason)',
];

// ABI tối giản cho Loan contract instance
const LoanContractABI = [
    'function getLoanDetails() view returns (tuple(uint256 loanId, address borrower, address lender, address loanToken, address collateralToken, uint256 principal, uint256 interestRate, uint256 collateralAmount, uint256 duration, uint256 startTime, uint256 endTime, uint8 status))',
    'function getTotalRepaymentAmount() view returns (uint256)',
    'function isOverdue() view returns (bool)',
    'function getCollateralRatio() view returns (uint256)',
    'event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 principal)',
    'event LoanFunded(uint256 indexed loanId, address indexed lender)',
    'event LoanRepaid(uint256 indexed loanId, uint256 totalAmount)',
    'event LoanLiquidated(uint256 indexed loanId, address indexed liquidator)',
    'event LoanCancelled(uint256 indexed loanId)',
];

// Mapping on-chain status (enum index) -> off-chain status
const ON_CHAIN_STATUS_MAP: Record<number, LOAN_STATUS_ENUM> = {
    0: LOAN_STATUS_ENUM.ACTIVE,      // PENDING on-chain => still active off-chain
    1: LOAN_STATUS_ENUM.ACTIVE,      // ACTIVE
    2: LOAN_STATUS_ENUM.REPAID,      // REPAID
    3: LOAN_STATUS_ENUM.DEFAULTED,   // DEFAULTED
    4: LOAN_STATUS_ENUM.LIQUIDATED,  // LIQUIDATED
};

export interface OnChainLoanStatus {
    loanId: number;
    borrower: string;
    lender: string;
    principal: string;
    interestRate: number;
    collateralAmount: string;
    duration: number;
    startTime: number;
    endTime: number;
    status: number;
    statusLabel: string;
    totalRepaymentAmount: string;
    isOverdue: boolean;
}

export interface TransactionVerification {
    isValid: boolean;
    blockNumber: number;
    from: string;
    to: string;
    value: string;
    status: number; // 1 = success, 0 = failed
    gasUsed: string;
    timestamp: number;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
    private readonly logger = new Logger(BlockchainService.name);
    private provider: ethers.JsonRpcProvider;
    private signer: ethers.Wallet | null = null;
    private p2pLendingContract: ethers.Contract;
    private debtTokenContract: ethers.Contract | null = null;
    private isListening = false;

    constructor(
        private configService: ConfigService,
        @InjectModel(Loan.name) private loanModel: Model<LoanDocument>,
        @InjectModel(LoanRequest.name) private loanRequestModel: Model<LoanRequestDocument>,
    ) {
        const rpcUrl = configService.get('BLOCKCHAIN_RPC_URL') || 'http://127.0.0.1:7545';
        this.provider = new ethers.JsonRpcProvider(rpcUrl);

        // Không cần khởi tạo signer cho Oracle ở đây nữa vì đã bỏ tính năng mint DebtToken từ backend
        const privateKey = configService.get<string>('ORACLE_PRIVATE_KEY');
        if (privateKey) {
            this.logger.log(`Backend có chứa ORACLE_PRIVATE_KEY (dành cho mục đích khác nếu cần)`);
        }

        const p2pAddress = configService.get('P2P_LENDING_ADDRESS');
        if (p2pAddress) {
            this.p2pLendingContract = new ethers.Contract(
                p2pAddress,
                P2PLendingABI,
                this.provider,
            );
            this.logger.log(`P2PLending contract: ${p2pAddress}`);
        } else {
            this.logger.warn('P2P_LENDING_ADDRESS chưa được cấu hình trong .env');
        }

        // Khởi tạo DebtToken contract chỉ với provider (Read-only)
        const debtTokenAddress = configService.get<string>('DEBT_TOKEN_ADDRESS');
        if (debtTokenAddress) {
            this.debtTokenContract = new ethers.Contract(
                debtTokenAddress,
                DebtTokenABI,
                this.provider,
            );
            this.logger.log(`DebtToken contract (Read-only): ${debtTokenAddress}`);
        } else {
            this.logger.warn('DEBT_TOKEN_ADDRESS chưa cấu hình — DebtToken disabled');
        }
    }

    async onModuleInit() {
        try {
            const network = await this.provider.getNetwork();
            this.logger.log(`✅ Kết nối blockchain thành công - ChainID: ${network.chainId}`);

            // Tự động khởi chạy event listener
            await this.startEventListener();
        } catch (error) {
            this.logger.error(`❌ Không thể kết nối blockchain: ${error.message}`);
        }
    }

    // ============================
    // 1. Lấy trạng thái khoản vay từ blockchain
    // ============================
    async getLoanOnChainStatus(loanContractAddress: string): Promise<OnChainLoanStatus | null> {
        try {
            const loanContract = new ethers.Contract(
                loanContractAddress,
                LoanContractABI,
                this.provider,
            );

            const details = await loanContract.getLoanDetails();
            const totalRepayment = await loanContract.getTotalRepaymentAmount();
            const overdue = await loanContract.isOverdue();

            const statusLabels = ['PENDING', 'ACTIVE', 'REPAID', 'DEFAULTED', 'LIQUIDATED', 'CANCELLED'];
            const statusIndex = Number(details.status);

            return {
                loanId: Number(details.loanId),
                borrower: details.borrower,
                lender: details.lender,
                principal: ethers.formatUnits(details.principal, 6), // USDT = 6 decimals
                interestRate: Number(details.interestRate),
                collateralAmount: ethers.formatEther(details.collateralAmount),
                duration: Number(details.duration),
                startTime: Number(details.startTime),
                endTime: Number(details.endTime),
                status: statusIndex,
                statusLabel: statusLabels[statusIndex] || 'UNKNOWN',
                totalRepaymentAmount: ethers.formatUnits(totalRepayment, 6),
                isOverdue: overdue,
            };
        } catch (error) {
            this.logger.error(`Lỗi đọc loan on-chain ${loanContractAddress}: ${error.message}`);
            return null;
        }
    }

    // ============================
    // 2. Verify giao dịch trên blockchain
    // ============================
    async verifyTransaction(txHash: string): Promise<TransactionVerification | null> {
        try {
            const tx = await this.provider.getTransaction(txHash);
            if (!tx) {
                this.logger.warn(`Transaction ${txHash} không tồn tại`);
                return null;
            }

            const receipt = await this.provider.getTransactionReceipt(txHash);
            if (!receipt) {
                return null;
            }

            const block = await this.provider.getBlock(receipt.blockNumber);

            return {
                isValid: receipt.status === 1,
                blockNumber: receipt.blockNumber,
                from: receipt.from,
                to: receipt.to,
                value: ethers.formatEther(tx.value),
                status: receipt.status,
                gasUsed: receipt.gasUsed.toString(),
                timestamp: block?.timestamp || 0,
            };
        } catch (error) {
            this.logger.error(`Lỗi verify transaction ${txHash}: ${error.message}`);
            return null;
        }
    }

    // ============================
    // 3. Lắng nghe events từ smart contracts
    // ============================
    async startEventListener() {
        if (this.isListening || !this.p2pLendingContract) {
            return;
        }

        try {
            // Event: LoanRequestCreated
            this.p2pLendingContract.on('LoanRequestCreated', async (requestId, borrower, principal) => {
                this.logger.log(`📝 [Event] LoanRequestCreated — ID: ${requestId}, Borrower: ${borrower}, Principal: ${ethers.formatUnits(principal, 6)} USDT`);
                // Có thể cập nhật MongoDB nếu request được tạo on-chain trước
            });

            // Event: LoanRequestCancelled
            this.p2pLendingContract.on('LoanRequestCancelled', async (requestId, borrower) => {
                this.logger.log(`❌ [Event] LoanRequestCancelled — ID: ${requestId}, Borrower: ${borrower}`);
            });

            // Event: LoanMatched (Funded)
            this.p2pLendingContract.on('LoanMatched', async (requestId, lender, loanContractAddr) => {
                this.logger.log(`💰 [Event] LoanMatched — RequestID: ${requestId}, Lender: ${lender}, LoanContract: ${loanContractAddr}`);
                await this.handleLoanFundedEvent(Number(requestId), lender, loanContractAddr);
            });

            // Lắng nghe events từ Loan contracts đã biết
            await this.attachLoanContractListeners();

            this.isListening = true;
            this.logger.log('🎧 Event listeners đã được khởi chạy thành công');
        } catch (error) {
            this.logger.error(`Lỗi khởi tạo event listener: ${error.message}`);
        }
    }

    /** Attach listeners cho tất cả Loan contracts đang active */
    private async attachLoanContractListeners() {
        try {
            const activeLoans = await this.loanModel.find({
                status: LOAN_STATUS_ENUM.ACTIVE,
                loanContractAddress: { $exists: true, $ne: null },
            });

            for (const loan of activeLoans) {
                this.attachSingleLoanListener(loan.loanContractAddress);
            }

            this.logger.log(`Attached listeners cho ${activeLoans.length} active loans`);
        } catch (error) {
            this.logger.error(`Lỗi attach loan listeners: ${error.message}`);
        }
    }

    /** Attach event listener cho 1 Loan contract */
    attachSingleLoanListener(loanContractAddress: string) {
        try {
            const loanContract = new ethers.Contract(
                loanContractAddress,
                LoanContractABI,
                this.provider,
            );

            loanContract.on('LoanRepaid', async (loanId, totalAmount) => {
                this.logger.log(`✅ [Event] LoanRepaid — ID: ${loanId}, Amount: ${ethers.formatUnits(totalAmount, 6)} USDT`);
                await this.handleLoanRepaidEvent(loanContractAddress, Number(totalAmount));
            });

            loanContract.on('LoanLiquidated', async (loanId, liquidator) => {
                this.logger.log(`⚠️ [Event] LoanLiquidated — ID: ${loanId}, Liquidator: ${liquidator}`);
                await this.handleLoanLiquidatedEvent(loanContractAddress);
            });

            loanContract.on('LoanCancelled', async (loanId) => {
                this.logger.log(`🚫 [Event] LoanCancelled — ID: ${loanId}`);
            });
        } catch (error) {
            this.logger.error(`Lỗi attach listener cho ${loanContractAddress}: ${error.message}`);
        }
    }

    // ============================
    // 4. Event Handlers — Đồng bộ event → MongoDB
    // ============================

    private async handleLoanFundedEvent(requestId: number, lender: string, loanContractAddr: string) {
        try {
            // Tìm LoanRequest tương ứng trong MongoDB bằng requestId on-chain
            // (requestId on-chain có thể khác ObjectId, nên tìm bằng các trường khác)
            // Cập nhật loan contract address nếu loan đã tồn tại
            const loan = await this.loanModel.findOne({ loanContractAddress: loanContractAddr });
            if (!loan) {
                this.logger.log(`Loan contract ${loanContractAddr} chưa có trong DB — sẽ được sync sau`);
                return;
            }
            loan.status = LOAN_STATUS_ENUM.ACTIVE;
            await loan.save();
            this.logger.log(`✅ Đã cập nhật loan ${loan._id} sang ACTIVE`);

            // Attach listener cho loan contract mới
            this.attachSingleLoanListener(loanContractAddr);
        } catch (error) {
            this.logger.error(`handleLoanFundedEvent error: ${error.message}`);
        }
    }

    private async handleLoanRepaidEvent(loanContractAddress: string, totalAmountWei: number) {
        try {
            const loan = await this.loanModel.findOne({ loanContractAddress });
            if (!loan) return;

            loan.status = LOAN_STATUS_ENUM.REPAID;
            loan.repaidAt = new Date();
            await loan.save();
            this.logger.log(`✅ Đã cập nhật loan ${loan._id} sang REPAID`);
        } catch (error) {
            this.logger.error(`handleLoanRepaidEvent error: ${error.message}`);
        }
    }

    private async handleLoanLiquidatedEvent(loanContractAddress: string) {
        try {
            const loan = await this.loanModel.findOne({ loanContractAddress })
                .populate('borrowerId', 'walletAddress')
                .populate('lenderId', 'walletAddress');
            if (!loan) return;

            loan.status = LOAN_STATUS_ENUM.LIQUIDATED;
            await loan.save();
            this.logger.log(`⚠️ Đã cập nhật loan ${loan._id} sang LIQUIDATED`);

            // Note: Việc mint DebtToken on-chain (Soulbound NFT) bây giờ đã được thực hiện
            // tự động bởi P2PLending contract trong giao dịch thanh lý (liquidateLoan).
        } catch (error) {
            this.logger.error(`handleLoanLiquidatedEvent error: ${error.message}`);
        }
    }


    /**
     * Lấy số DebtToken (số lần vỡ nợ) của một địa chỉ ví.
     * Dùng để tính credit score hoặc hiển thị trên UI.
     */
    async getDebtCount(walletAddress: string): Promise<number> {
        if (!this.debtTokenContract) return 0;
        try {
            const count = await this.debtTokenContract.getDebtCount(walletAddress);
            return Number(count);
        } catch {
            return 0;
        }
    }

    // ============================
    // 5. Lấy pending requests từ contract
    // ============================
    async getPendingRequests(): Promise<any[]> {
        try {
            if (!this.p2pLendingContract) return [];

            const pendingIds: bigint[] = await this.p2pLendingContract.getPendingRequests();
            const requests = [];

            for (const id of pendingIds) {
                const req = await this.p2pLendingContract.getLoanRequest(id);
                const borrower = await this.p2pLendingContract.requestBorrower(id);

                requests.push({
                    requestId: Number(id),
                    borrower,
                    loanToken: req.loanToken,
                    collateralToken: req.collateralToken,
                    principal: ethers.formatUnits(req.principal, 6),
                    interestRate: Number(req.interestRate),
                    collateralAmount: ethers.formatEther(req.collateralAmount),
                    duration: Number(req.duration),
                });
            }

            return requests;
        } catch (error) {
            this.logger.error(`getPendingRequests error: ${error.message}`);
            return [];
        }
    }

    // ============================
    // 6. Đồng bộ trạng thái từ blockchain vào MongoDB
    // ============================
    async syncLoanStatus(loanId: string): Promise<boolean> {
        try {
            const loan = await this.loanModel.findById(loanId);
            if (!loan || !loan.loanContractAddress) {
                this.logger.warn(`Loan ${loanId} không tồn tại hoặc chưa có contract address`);
                return false;
            }

            const onChainStatus = await this.getLoanOnChainStatus(loan.loanContractAddress);
            if (!onChainStatus) {
                return false;
            }

            const mappedStatus = ON_CHAIN_STATUS_MAP[onChainStatus.status];
            if (mappedStatus && loan.status !== mappedStatus) {
                const oldStatus = loan.status;
                loan.status = mappedStatus;

                // Cập nhật thêm thông tin nếu REPAID
                if (mappedStatus === LOAN_STATUS_ENUM.REPAID) {
                    loan.repaidAt = new Date();
                }

                // Cập nhật overdue
                if (onChainStatus.isOverdue && loan.status === LOAN_STATUS_ENUM.ACTIVE) {
                    loan.status = LOAN_STATUS_ENUM.OVERDUE;
                }

                await loan.save();
                this.logger.log(`🔄 Sync loan ${loanId}: ${oldStatus} → ${loan.status}`);
            }

            return true;
        } catch (error) {
            this.logger.error(`syncLoanStatus error for ${loanId}: ${error.message}`);
            return false;
        }
    }

    // ============================
    // 7. Sync tất cả khoản vay active
    // ============================
    async syncAllActiveLoans(): Promise<{ synced: number; errors: number }> {
        let synced = 0;
        let errors = 0;

        try {
            const activeLoans = await this.loanModel.find({
                status: { $in: [LOAN_STATUS_ENUM.ACTIVE, LOAN_STATUS_ENUM.OVERDUE] },
                loanContractAddress: { $exists: true, $ne: null },
            });

            for (const loan of activeLoans) {
                const result = await this.syncLoanStatus(loan._id.toString());
                if (result) synced++;
                else errors++;
            }

            this.logger.log(`🔄 Sync hoàn tất: ${synced} thành công, ${errors} lỗi`);
        } catch (error) {
            this.logger.error(`syncAllActiveLoans error: ${error.message}`);
        }

        return { synced, errors };
    }

    // ============================
    // 8. Kiểm tra khoản vay quá hạn
    // ============================
    async checkOverdueLoans(): Promise<number> {
        let overdueCount = 0;
        try {
            // ACTIVE → OVERDUE: quá dueDate nhưng chưa trả
            const activeLoans = await this.loanModel.find({
                status: LOAN_STATUS_ENUM.ACTIVE,
                dueDate: { $lt: new Date() },
            });

            for (const loan of activeLoans) {
                loan.status = LOAN_STATUS_ENUM.OVERDUE;
                await loan.save();
                overdueCount++;
                this.logger.warn(`⚠️ Loan ${loan._id} đã quá hạn (OVERDUE)`);
            }

            // OVERDUE → DEFAULTED: quá hạn ≥ 7 ngày mà vẫn chưa trả
            // → Mint DebtToken on-chain
            const gracePeriod = 7 * 24 * 60 * 60 * 1000; // 7 ngày
            const defaultCutoff = new Date(Date.now() - gracePeriod);

            const overdueLoans = await this.loanModel
                .find({
                    status: LOAN_STATUS_ENUM.OVERDUE,
                    dueDate: { $lt: defaultCutoff },
                    debtTokenMinted: { $ne: true }, // Tránh mint 2 lần
                })
                .populate('borrowerId', 'walletAddress')
                .populate('lenderId', 'walletAddress');

            for (const loan of overdueLoans) {
                loan.status = LOAN_STATUS_ENUM.DEFAULTED;
                await loan.save();
                this.logger.warn(`🔴 Loan ${loan._id} chuyển sang DEFAULTED off-chain.`);
            }

            if (overdueCount > 0) {
                this.logger.log(`Phát hiện ${overdueCount} khoản vay quá hạn`);
            }
        } catch (error) {
            this.logger.error(`checkOverdueLoans error: ${error.message}`);
        }

        return overdueCount;
    }

    // ============================
    // 9. Lấy thông tin platform
    // ============================
    async getContractInfo() {
        try {
            if (!this.p2pLendingContract) return null;

            const [platformFee, minCollateralRatio] = await Promise.all([
                this.p2pLendingContract.getPlatformFee(),
                this.p2pLendingContract.getMinCollateralRatio(),
            ]);

            // ETH price: lấy từ config hoặc mặc định 2000 USD (Ganache demo)
            const ethPrice = Number(this.configService.get('ETH_PRICE_USD')) || 2000;

            return {
                platformFee: Number(platformFee) / 100, // basis points → %
                minCollateralRatio: Number(minCollateralRatio) / 100, // basis points → %
                ethPrice,
            };
        } catch (error) {
            this.logger.error(`getContractInfo error: ${error.message}`);
            return null;
        }
    }

    // ============================
    // 10. Lấy thống kê blockchain
    // ============================
    async getBlockchainStats() {
        try {
            const blockNumber = await this.provider.getBlockNumber();
            const network = await this.provider.getNetwork();

            return {
                connected: true,
                chainId: Number(network.chainId),
                blockNumber,
                contractAddress: this.configService.get('P2P_LENDING_ADDRESS') || 'N/A',
                isListening: this.isListening,
            };
        } catch (error) {
            return {
                connected: false,
                chainId: 0,
                blockNumber: 0,
                contractAddress: 'N/A',
                isListening: false,
                error: error.message,
            };
        }
    }
}
