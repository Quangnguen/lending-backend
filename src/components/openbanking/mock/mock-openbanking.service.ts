import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { VN_BANKS, MOCK_ACCOUNTS, MOCK_TRANSACTIONS } from './vn-banks.data';
import { LinkBankDto, VerifyOtpDto, BankConnectionResponse, BankAccount, BankTransaction } from '../dto/openbanking.dto';

@Injectable()
export class MockOpenBankingService {
    // Lưu trữ tạm các phiên OTP trong bộ nhớ Ram
    // key: transactionId, value: {bankId, username, timestamp}
    private otpSessions = new Map<string, { bankId: string; username: string; timestamp: number }>();

    //1. Get list of banks
    getBanks() {
        return VN_BANKS;
    }

    //2. step 1: Request link bank
    async initiateLink(dto: LinkBankDto): Promise<BankConnectionResponse> {
        const { bankId, username, password } = dto;

        // Check if bank exists
        const bank = VN_BANKS.find(b => b.id === bankId);
        if (!bank) {
            throw new BadRequestException('Bank not found');
        }

        // Mock check credentials
        // In production, this would be a call to the bank's API
        if (username === 'demo_user' && password === 'demo_pass') {
            // Create OTP session
            const transactionId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            // Save session(5 minute)
            this.otpSessions.set(transactionId, {
                bankId,
                username,
                timestamp: Date.now()
            });

            return {
                success: true,
                message: 'OTP sent successfully',
                transactionId: transactionId
            }
        }

        throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Step 2: Verify OTP
    async verifyOtp(dto: VerifyOtpDto): Promise<BankConnectionResponse> {
        const { transactionId, otp } = dto;

        // Check transactionId
        const session = this.otpSessions.get(transactionId);
        if (!session) {
            throw new BadRequestException('Invalid transaction ID');
        }

        if (Date.now() - session.timestamp > 5 * 60 * 1000) {
            this.otpSessions.delete(transactionId);
            throw new BadRequestException('OTP expired');
        }

        // Mock OTP check
        if (otp === '123456') {
            const accounts = MOCK_ACCOUNTS[session.username] || [];
            const linkedAccounts = accounts.filter(acc => acc.bankId == session.bankId);

            // delete otp session when success
            this.otpSessions.delete(transactionId);

            return {
                success: true,
                message: 'Link bank successfully',
                data: {
                    linkedAccounts: linkedAccounts
                }
            }
        }

        throw new BadRequestException('Invalid OTP');
    }

    // 4. get list of accounts
    async getAccounts(username: string): Promise<BankAccount[]> {
        return MOCK_ACCOUNTS[username] || [];
    }

    // 5. get list history transactions
    async getTransactions(username: string): Promise<BankTransaction[]> {
        return MOCK_TRANSACTIONS[username] || [];
    }

    // 6. calculate point credit
    async calculateCreditScore(username: string): Promise<number> {
        const accounts = MOCK_ACCOUNTS[username] || [];
        if (accounts.length === 0) return 0;

        const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

        if (totalBalance > 100000000) return 1000;
        if (totalBalance > 50000000) return 700;
        if (totalBalance > 10000000) return 500;
        return 400;
    }
}