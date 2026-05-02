import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { CreditScoringEngine } from '../credit/credit-scoring.engine';

/**
 * OraclePublisherService — Đẩy Credit Score từ backend lên Blockchain
 *
 * Đây là cầu nối giữa off-chain (MongoDB) và on-chain (CreditScoreOracle.sol)
 *
 * Flow:
 * 1. CreditScoringEngine tính score → lưu MongoDB
 * 2. OraclePublisher đọc score → gọi CreditScoreOracle.updateCreditScore()
 * 3. P2PLending.sol đọc score từ Oracle → tính dynamic collateral ratio
 *
 * Bảo mật:
 * - Sử dụng ORACLE_PRIVATE_KEY (ví riêng chỉ dùng để update score)
 * - CreditScoreOracle.sol chỉ chấp nhận tx từ oracleUpdater address
 */

// ABI tối giản cho CreditScoreOracle
const CreditScoreOracleABI = [
    'function updateCreditScore(address borrower, uint256 score) external',
    'function batchUpdateScores(address[] calldata borrowers, uint256[] calldata scores) external',
    'function getCreditScore(address borrower) external view returns (uint256 score, uint256 timestamp, bool isValid)',
    'function getRequiredCollateralRatio(address borrower) external view returns (uint256 ratio)',
    'function hasValidScore(address borrower) external view returns (bool)',
    'function oracleUpdater() external view returns (address)',
    'event CreditScoreUpdated(address indexed borrower, uint256 oldScore, uint256 newScore, uint256 timestamp)',
];

@Injectable()
export class OraclePublisherService implements OnModuleInit {
    private readonly logger = new Logger(OraclePublisherService.name);
    private provider: ethers.JsonRpcProvider;
    private oracleWallet: ethers.Wallet;
    private oracleContract: ethers.Contract;
    private isConfigured = false;

    constructor(
        private configService: ConfigService,
    ) {}

    async onModuleInit() {
        try {
            const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
            const oraclePrivateKey = this.configService.get<string>('ORACLE_PRIVATE_KEY');
            const oracleContractAddress = this.configService.get<string>('CREDIT_SCORE_ORACLE_ADDRESS');

            if (!rpcUrl || !oraclePrivateKey || !oracleContractAddress) {
                this.logger.warn(
                    '[OraclePublisher] Missing config (BLOCKCHAIN_RPC_URL, ORACLE_PRIVATE_KEY, CREDIT_SCORE_ORACLE_ADDRESS). ' +
                    'Oracle publishing disabled. Scores will only be saved to MongoDB.'
                );
                return;
            }

            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.oracleWallet = new ethers.Wallet(oraclePrivateKey, this.provider);
            this.oracleContract = new ethers.Contract(
                oracleContractAddress,
                CreditScoreOracleABI,
                this.oracleWallet,
            );

            // Verify connection
            const network = await this.provider.getNetwork();
            const updaterAddress = await this.oracleContract.oracleUpdater();

            if (updaterAddress.toLowerCase() !== this.oracleWallet.address.toLowerCase()) {
                this.logger.error(
                    `[OraclePublisher] Wallet address ${this.oracleWallet.address} does not match ` +
                    `Oracle updater ${updaterAddress}. Publishing will fail!`
                );
                return;
            }

            this.isConfigured = true;
            this.logger.log(
                `[OraclePublisher] ✅ Configured | Network: ${network.name} (${network.chainId}) | ` +
                `Oracle: ${oracleContractAddress} | Updater: ${this.oracleWallet.address}`
            );
        } catch (error) {
            this.logger.error(`[OraclePublisher] Init failed: ${error.message}`);
        }
    }

    /**
     * Đẩy credit score của 1 user lên blockchain
     *
     * @param walletAddress Địa chỉ ví Ethereum của borrower
     * @param score Điểm tín dụng (0-1000)
     * @returns Transaction hash nếu thành công, null nếu Oracle chưa configured
     */
    async publishScore(walletAddress: string, score: number): Promise<string | null> {
        if (!this.isConfigured) {
            this.logger.debug(`[OraclePublisher] Not configured - skipping publish for ${walletAddress}`);
            return null;
        }

        try {
            // Validate
            if (!ethers.isAddress(walletAddress)) {
                this.logger.error(`[OraclePublisher] Invalid address: ${walletAddress}`);
                return null;
            }
            if (score < 0 || score > 1000) {
                this.logger.error(`[OraclePublisher] Invalid score: ${score}`);
                return null;
            }

            this.logger.log(`[OraclePublisher] Publishing score ${score} for ${walletAddress}...`);

            const tx = await this.oracleContract.updateCreditScore(walletAddress, score);
            const receipt = await tx.wait();

            this.logger.log(
                `[OraclePublisher] ✅ Score published! Tx: ${receipt.hash} | ` +
                `Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed.toString()}`
            );

            return receipt.hash;
        } catch (error) {
            this.logger.error(`[OraclePublisher] ❌ Failed to publish score: ${error.message}`);
            return null;
        }
    }

    /**
     * Đẩy scores hàng loạt (batch) — tiết kiệm gas
     *
     * @param entries Array of {walletAddress, score}
     * @returns Transaction hash
     */
    async publishBatchScores(
        entries: Array<{ walletAddress: string; score: number }>,
    ): Promise<string | null> {
        if (!this.isConfigured) {
            this.logger.debug('[OraclePublisher] Not configured - skipping batch publish');
            return null;
        }

        try {
            const addresses = entries.map(e => e.walletAddress);
            const scores = entries.map(e => e.score);

            this.logger.log(`[OraclePublisher] Batch publishing ${entries.length} scores...`);

            const tx = await this.oracleContract.batchUpdateScores(addresses, scores);
            const receipt = await tx.wait();

            this.logger.log(
                `[OraclePublisher] ✅ Batch published! Tx: ${receipt.hash} | ` +
                `Count: ${entries.length} | Gas: ${receipt.gasUsed.toString()}`
            );

            return receipt.hash;
        } catch (error) {
            this.logger.error(`[OraclePublisher] ❌ Batch publish failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Đọc score hiện tại trên blockchain cho borrower
     */
    async getOnChainScore(walletAddress: string): Promise<{
        score: number;
        timestamp: number;
        isValid: boolean;
        collateralRatio: number;
    } | null> {
        if (!this.isConfigured) return null;

        try {
            const [score, timestamp, isValid] = await this.oracleContract.getCreditScore(walletAddress);
            const ratio = await this.oracleContract.getRequiredCollateralRatio(walletAddress);

            return {
                score: Number(score),
                timestamp: Number(timestamp),
                isValid,
                collateralRatio: Number(ratio) / 100, // basis points → percentage
            };
        } catch (error) {
            this.logger.error(`[OraclePublisher] Failed to read on-chain score: ${error.message}`);
            return null;
        }
    }

    /**
     * Kiểm tra Oracle có sẵn sàng không
     */
    isReady(): boolean {
        return this.isConfigured;
    }
}
