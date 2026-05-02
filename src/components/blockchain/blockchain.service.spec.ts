import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { BlockchainService } from './blockchain.service';
import { Loan } from '@database/schemas/loan.model';
import { LoanRequest } from '@database/schemas/bank-request.model';

// Mock ethers Provider
jest.mock('ethers', () => {
    const original = jest.requireActual('ethers');
    return {
        ...original,
        JsonRpcProvider: jest.fn().mockImplementation(() => ({
            getNetwork: jest.fn().mockResolvedValue({ chainId: BigInt(1337) }),
            getBlockNumber: jest.fn().mockResolvedValue(100),
            getTransaction: jest.fn(),
            getTransactionReceipt: jest.fn(),
            getBlock: jest.fn(),
        })),
        Contract: jest.fn().mockImplementation(() => ({
            getPendingRequests: jest.fn().mockResolvedValue([]),
            getLoanRequest: jest.fn(),
            requestBorrower: jest.fn(),
            getPlatformFee: jest.fn().mockResolvedValue(BigInt(100)),
            getMinCollateralRatio: jest.fn().mockResolvedValue(BigInt(15000)),
            on: jest.fn(),
            getLoanDetails: jest.fn(),
            getTotalRepaymentAmount: jest.fn(),
            isOverdue: jest.fn(),
        })),
        formatUnits: original.formatUnits,
        formatEther: original.formatEther,
    };
});

describe('BlockchainService', () => {
    let service: BlockchainService;
    let loanModel: any;
    let loanRequestModel: any;

    const mockLoanModel = {
        find: jest.fn(),
        findById: jest.fn(),
        findOne: jest.fn(),
        countDocuments: jest.fn(),
    };

    const mockLoanRequestModel = {
        find: jest.fn(),
        findById: jest.fn(),
    };

    const mockConfigService = {
        get: jest.fn((key: string) => {
            const config: Record<string, string> = {
                BLOCKCHAIN_RPC_URL: 'http://127.0.0.1:7545',
                P2P_LENDING_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            };
            return config[key];
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BlockchainService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: getModelToken(Loan.name), useValue: mockLoanModel },
                { provide: getModelToken(LoanRequest.name), useValue: mockLoanRequestModel },
            ],
        }).compile();

        service = module.get<BlockchainService>(BlockchainService);
        loanModel = module.get(getModelToken(Loan.name));
        loanRequestModel = module.get(getModelToken(LoanRequest.name));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('verifyTransaction', () => {
        it('should return null for non-existent transaction', async () => {
            // Provider mock already returns undefined for getTransaction
            const result = await service.verifyTransaction('0xinvalid');
            expect(result).toBeNull();
        });
    });

    describe('getPendingRequests', () => {
        it('should return empty array when no pending requests', async () => {
            const result = await service.getPendingRequests();
            expect(result).toEqual([]);
        });
    });

    describe('getBlockchainStats', () => {
        it('should return connection stats', async () => {
            const stats = await service.getBlockchainStats();
            expect(stats).toBeDefined();
            expect(stats).toHaveProperty('connected');
            expect(stats).toHaveProperty('blockNumber');
            expect(stats).toHaveProperty('isListening');
        });
    });

    describe('syncLoanStatus', () => {
        it('should return false for non-existent loan', async () => {
            mockLoanModel.findById.mockResolvedValue(null);
            const result = await service.syncLoanStatus('nonexistent-id');
            expect(result).toBe(false);
        });

        it('should return false for loan without contract address', async () => {
            mockLoanModel.findById.mockResolvedValue({
                _id: 'test-id',
                loanContractAddress: null,
            });
            const result = await service.syncLoanStatus('test-id');
            expect(result).toBe(false);
        });
    });

    describe('syncAllActiveLoans', () => {
        it('should return sync results', async () => {
            mockLoanModel.find.mockResolvedValue([]);
            const result = await service.syncAllActiveLoans();
            expect(result).toHaveProperty('synced');
            expect(result).toHaveProperty('errors');
            expect(result.synced).toBe(0);
            expect(result.errors).toBe(0);
        });
    });

    describe('checkOverdueLoans', () => {
        it('should return 0 when no overdue loans', async () => {
            mockLoanModel.find.mockResolvedValue([]);
            const result = await service.checkOverdueLoans();
            expect(result).toBe(0);
        });

        it('should mark loans as overdue when past due date', async () => {
            const mockLoan = {
                _id: 'loan-1',
                status: 'active',
                dueDate: new Date('2020-01-01'),
                save: jest.fn().mockResolvedValue(true),
            };
            mockLoanModel.find.mockResolvedValue([mockLoan]);

            const result = await service.checkOverdueLoans();
            expect(result).toBe(1);
            expect(mockLoan.status).toBe('overdue');
            expect(mockLoan.save).toHaveBeenCalled();
        });
    });

    describe('getContractInfo', () => {
        it('should return platform fee and collateral ratio', async () => {
            const info = await service.getContractInfo();
            expect(info).toBeDefined();
            if (info) {
                expect(info).toHaveProperty('platformFee');
                expect(info).toHaveProperty('minCollateralRatio');
            }
        });
    });
});
