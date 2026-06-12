import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { CreditService } from './credit.service';
import { CreditScore } from '@database/schemas/credit-score.model';
import { User } from '@database/schemas/user.model';
import { OpenBankingService } from '../openbanking/openbanking.service';
import { MockOpenBankingService } from '../openbanking/mock/mock-openbanking.service';

describe('CreditService', () => {
  let service: CreditService;

  const mockCreditScoreModel = {
    create: jest.fn(),
    findOne: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockUserModel = {
    findByIdAndUpdate: jest.fn(),
  };

  const mockOpenBankingService = {
    getAccounts: jest.fn(),
    getTransactions: jest.fn(),
  };

  const mockRealOpenBankingService = {
    getUserConnections: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        {
          provide: getModelToken(CreditScore.name),
          useValue: mockCreditScoreModel,
        },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: OpenBankingService, useValue: mockRealOpenBankingService },
        { provide: MockOpenBankingService, useValue: mockOpenBankingService },
      ],
    }).compile();

    service = module.get<CreditService>(CreditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateCreditScore', () => {
    const userId = new Types.ObjectId().toString();

    it('should return score 0 and rating UNRATED when no bank accounts', async () => {
      mockRealOpenBankingService.getUserConnections.mockResolvedValue([]);
      const mockCreatedScore = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        score: 0,
        rating: 'UNRATED',
        loanLimit: 0,
      };
      mockCreditScoreModel.create.mockResolvedValue(mockCreatedScore);

      const result = await service.calculateCreditScore(userId);
      expect(result.score).toBe(0);
      expect(result.rating).toBe('UNRATED');
    });

    it('should calculate score based on bank data', async () => {
      mockRealOpenBankingService.getUserConnections.mockResolvedValue([
        { bankCode: 'TCB', linkedAt: new Date() },
      ]);
      const mockAccounts = [
        { id: 'acc-1', balance: 3000 },
        { id: 'acc-2', balance: 1500 },
      ];
      const mockTransactions = [
        { type: 'IN', amount: 2000 },
        { type: 'OUT', amount: 800 },
        { type: 'IN', amount: 1500 },
        { type: 'OUT', amount: 600 },
      ];

      mockOpenBankingService.getAccounts.mockResolvedValue(mockAccounts);
      mockOpenBankingService.getTransactions.mockResolvedValue(
        mockTransactions,
      );

      const mockCreatedScore = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        score: 750,
        rating: 'GOOD',
        loanLimit: 1000,
      };
      mockCreditScoreModel.create.mockResolvedValue(mockCreatedScore);

      const result = await service.calculateCreditScore(userId);

      expect(result).toBeDefined();
      expect(mockCreditScoreModel.create).toHaveBeenCalled();

      // Verify the create call includes expected fields
      const createArg = mockCreditScoreModel.create.mock.calls[0][0];
      expect(createArg).toHaveProperty('score');
      expect(createArg).toHaveProperty('rating');
      expect(createArg).toHaveProperty('loanLimit');
      expect(createArg).toHaveProperty('breakdown');
      expect(createArg.score).toBeGreaterThan(0);
    });
  });

  describe('getLatestScore', () => {
    it('should return null when no score exists', async () => {
      mockCreditScoreModel.exec.mockResolvedValue(null);

      const result = await service.getLatestScore(
        new Types.ObjectId().toString(),
      );
      expect(result).toBeNull();
    });

    it('should return the latest score', async () => {
      const mockScore = {
        score: 800,
        rating: 'EXCELLENT',
        loanLimit: 5000,
      };
      mockCreditScoreModel.exec.mockResolvedValue(mockScore);

      const result = await service.getLatestScore(
        new Types.ObjectId().toString(),
      );
      expect(result).toBeDefined();
      expect(result.score).toBe(800);
    });
  });
});
