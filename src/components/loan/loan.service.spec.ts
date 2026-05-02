import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LoanService } from './loan.service';
import { CreditService } from '../credit/credit.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { Loan } from '@database/schemas/loan.model';
import { LoanRequest } from '@database/schemas/bank-request.model';
import { LoanRepayment } from '@database/schemas/loan-repayment.model';
import { LoanOffer } from '@database/schemas/loan-offer.model';
import { LOAN_REQUEST_STATUS_ENUM, LOAN_STATUS_ENUM } from '@constant/p2p-lending.enum';

describe('LoanService', () => {
    let service: LoanService;

    const userId = new Types.ObjectId().toString();
    const lenderId = new Types.ObjectId().toString();

    // ===== Mock Models =====
    const mockLoanRequestModel = {
        create: jest.fn(),
        find: jest.fn().mockReturnThis(),
        findById: jest.fn(),
        countDocuments: jest.fn(),
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn(),
    };

    const mockLoanModel = {
        create: jest.fn(),
        find: jest.fn().mockReturnThis(),
        findById: jest.fn(),
        countDocuments: jest.fn(),
        aggregate: jest.fn(),
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn(),
    };

    const mockRepaymentModel = {
        create: jest.fn(),
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn(),
    };

    const mockOfferModel = {};

    const mockCreditService = {
        getLatestScore: jest.fn(),
        calculateCreditScore: jest.fn(),
    };

    const mockBlockchainService = {
        verifyTransaction: jest.fn(),
        getLoanOnChainStatus: jest.fn(),
        attachSingleLoanListener: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LoanService,
                { provide: getModelToken(LoanRequest.name), useValue: mockLoanRequestModel },
                { provide: getModelToken(Loan.name), useValue: mockLoanModel },
                { provide: getModelToken(LoanRepayment.name), useValue: mockRepaymentModel },
                { provide: getModelToken(LoanOffer.name), useValue: mockOfferModel },
                { provide: CreditService, useValue: mockCreditService },
                { provide: BlockchainService, useValue: mockBlockchainService },
            ],
        }).compile();

        service = module.get<LoanService>(LoanService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ===== createLoanRequest =====
    describe('createLoanRequest', () => {
        const createDto = {
            loanAmount: 1000,
            interestRate: 12,
            durationDays: 30,
            purpose: 'personal' as any,
            collateralType: 'crypto' as any,
            collateralAmount: 0.5,
        };

        it('should create a loan request successfully', async () => {
            mockCreditService.getLatestScore.mockResolvedValue({
                score: 700,
                rating: 'GOOD',
                loanLimit: 5000,
            });
            mockLoanRequestModel.countDocuments.mockResolvedValue(0);
            const mockCreated = {
                _id: new Types.ObjectId(),
                ...createDto,
                borrowerId: new Types.ObjectId(userId),
                status: LOAN_REQUEST_STATUS_ENUM.PENDING,
            };
            mockLoanRequestModel.create.mockResolvedValue(mockCreated);

            const result = await service.createLoanRequest(userId, createDto);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(mockLoanRequestModel.create).toHaveBeenCalled();
        });

        it('should reject if loan amount exceeds credit limit', async () => {
            mockCreditService.getLatestScore.mockResolvedValue({
                score: 400,
                rating: 'POOR',
                loanLimit: 500,
            });

            await expect(
                service.createLoanRequest(userId, createDto),
            ).rejects.toThrow(BadRequestException);
        });

        it('should reject if too many pending requests', async () => {
            mockCreditService.getLatestScore.mockResolvedValue({
                score: 700,
                rating: 'GOOD',
                loanLimit: 5000,
            });
            mockLoanRequestModel.countDocuments.mockResolvedValue(3);

            await expect(
                service.createLoanRequest(userId, createDto),
            ).rejects.toThrow(BadRequestException);
        });
    });

    // ===== fundLoan =====
    describe('fundLoan', () => {
        const fundDto = { txHash: '0xabc123', loanContractAddress: '0xContract' };

        it('should reject if request not found', async () => {
            mockLoanRequestModel.findById.mockResolvedValue(null);

            await expect(
                service.fundLoan(lenderId, 'nonexistent', fundDto),
            ).rejects.toThrow(NotFoundException);
        });

        it('should reject if request is not PENDING', async () => {
            mockLoanRequestModel.findById.mockResolvedValue({
                _id: new Types.ObjectId(),
                status: LOAN_REQUEST_STATUS_ENUM.FUNDED,
                borrowerId: new Types.ObjectId(userId),
            });

            await expect(
                service.fundLoan(lenderId, 'req-id', fundDto),
            ).rejects.toThrow(BadRequestException);
        });

        it('should reject if lender tries to fund own request', async () => {
            mockLoanRequestModel.findById.mockResolvedValue({
                _id: new Types.ObjectId(),
                status: LOAN_REQUEST_STATUS_ENUM.PENDING,
                borrowerId: new Types.ObjectId(lenderId),
                loanAmount: 1000,
                interestRate: 12,
                durationDays: 30,
            });

            await expect(
                service.fundLoan(lenderId, 'req-id', fundDto),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should fund successfully when valid', async () => {
            const borrowerId = new Types.ObjectId();
            const mockRequest = {
                _id: new Types.ObjectId(),
                status: LOAN_REQUEST_STATUS_ENUM.PENDING,
                borrowerId,
                loanAmount: 1000,
                interestRate: 12,
                durationDays: 30,
                save: jest.fn().mockResolvedValue(true),
            };
            mockLoanRequestModel.findById.mockResolvedValue(mockRequest);
            mockBlockchainService.verifyTransaction.mockResolvedValue({ isValid: true });

            const mockLoan = {
                _id: new Types.ObjectId(),
                principalAmount: 1000,
                status: LOAN_STATUS_ENUM.ACTIVE,
            };
            mockLoanModel.create.mockResolvedValue(mockLoan);

            const result = await service.fundLoan(lenderId, 'req-id', fundDto);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(mockRequest.status).toBe(LOAN_REQUEST_STATUS_ENUM.FUNDED);
            expect(mockRequest.save).toHaveBeenCalled();
            expect(mockBlockchainService.attachSingleLoanListener).toHaveBeenCalledWith('0xContract');
        });
    });

    // ===== repayLoan =====
    describe('repayLoan', () => {
        const repayDto = { txHash: '0xrepay123', amount: 1050 };

        it('should reject if loan not found', async () => {
            mockLoanModel.findById.mockResolvedValue(null);

            await expect(
                service.repayLoan(userId, 'nonexistent', repayDto),
            ).rejects.toThrow(NotFoundException);
        });

        it('should reject if not the borrower', async () => {
            mockLoanModel.findById.mockResolvedValue({
                _id: new Types.ObjectId(),
                borrowerId: new Types.ObjectId(), // different user
                status: LOAN_STATUS_ENUM.ACTIVE,
            });

            await expect(
                service.repayLoan(userId, 'loan-id', repayDto),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should reject if loan is not active/overdue', async () => {
            mockLoanModel.findById.mockResolvedValue({
                _id: new Types.ObjectId(),
                borrowerId: new Types.ObjectId(userId),
                status: LOAN_STATUS_ENUM.REPAID,
            });

            await expect(
                service.repayLoan(userId, 'loan-id', repayDto),
            ).rejects.toThrow(BadRequestException);
        });

        it('should repay successfully when valid', async () => {
            const mockLoan = {
                _id: new Types.ObjectId(),
                borrowerId: new Types.ObjectId(userId),
                status: LOAN_STATUS_ENUM.ACTIVE,
                principalAmount: 1000,
                totalInterest: 50,
                totalAmount: 1050,
                amountPaid: 0,
                remainingAmount: 1050,
                dueDate: new Date(Date.now() + 86400000), // tomorrow
                save: jest.fn().mockResolvedValue(true),
            };
            mockLoanModel.findById.mockResolvedValue(mockLoan);
            mockBlockchainService.verifyTransaction.mockResolvedValue({ isValid: true });
            mockRepaymentModel.create.mockResolvedValue({ _id: new Types.ObjectId() });

            const result = await service.repayLoan(userId, 'loan-id', repayDto);

            expect(result.success).toBe(true);
            expect(mockLoan.status).toBe(LOAN_STATUS_ENUM.REPAID);
            expect(mockLoan.save).toHaveBeenCalled();
        });
    });

    // ===== cancelLoanRequest =====
    describe('cancelLoanRequest', () => {
        it('should reject if request not found', async () => {
            mockLoanRequestModel.findById.mockResolvedValue(null);

            await expect(
                service.cancelLoanRequest(userId, 'nonexistent'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should reject if not the owner', async () => {
            mockLoanRequestModel.findById.mockResolvedValue({
                borrowerId: new Types.ObjectId(),
                status: LOAN_REQUEST_STATUS_ENUM.PENDING,
            });

            await expect(
                service.cancelLoanRequest(userId, 'req-id'),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should reject if not pending', async () => {
            mockLoanRequestModel.findById.mockResolvedValue({
                borrowerId: new Types.ObjectId(userId),
                status: LOAN_REQUEST_STATUS_ENUM.FUNDED,
            });

            await expect(
                service.cancelLoanRequest(userId, 'req-id'),
            ).rejects.toThrow(BadRequestException);
        });

        it('should cancel successfully', async () => {
            const mockRequest = {
                borrowerId: new Types.ObjectId(userId),
                status: LOAN_REQUEST_STATUS_ENUM.PENDING,
                save: jest.fn().mockResolvedValue(true),
            };
            mockLoanRequestModel.findById.mockResolvedValue(mockRequest);

            const result = await service.cancelLoanRequest(userId, 'req-id');

            expect(result.success).toBe(true);
            expect(mockRequest.status).toBe(LOAN_REQUEST_STATUS_ENUM.CANCELLED);
        });
    });

    // ===== getLoanStats =====
    describe('getLoanStats', () => {
        it('should return aggregated statistics', async () => {
            mockLoanRequestModel.countDocuments
                .mockResolvedValueOnce(10) // totalRequests
                .mockResolvedValueOnce(3)  // pending
                .mockResolvedValueOnce(5); // funded

            mockLoanModel.countDocuments
                .mockResolvedValueOnce(5)  // totalLoans
                .mockResolvedValueOnce(2)  // active
                .mockResolvedValueOnce(2)  // repaid
                .mockResolvedValueOnce(1)  // overdue
                .mockResolvedValueOnce(0); // defaulted

            mockLoanModel.aggregate.mockResolvedValue([
                { totalPrincipal: 5000, totalInterest: 250, totalPaid: 2100 },
            ]);

            const stats = await service.getLoanStats();

            expect(stats.requests.total).toBe(10);
            expect(stats.requests.pending).toBe(3);
            expect(stats.loans.total).toBe(5);
            expect(stats.loans.active).toBe(2);
            expect(stats.values.totalDisbursed).toBe(5000);
            expect(stats.repaymentRate).toBeGreaterThanOrEqual(0);
        });
    });
});
