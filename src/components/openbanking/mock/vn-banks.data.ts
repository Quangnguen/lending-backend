import { BankAccount, BankTransaction } from '../dto/openbanking.dto';

/**
 * Mock data cho demo - sử dụng mã ngân hàng VietQR thật
 * Logo lấy từ CDN của VietQR
 */

export const MOCK_ACCOUNTS: Record<string, BankAccount[]> = {
  demo_user: [
    {
      id: 'acc_vcb_01',
      bankId: 'VCB', // VietQR bank code
      accountNumber: '0011001234567',
      accountName: 'NGUYEN VAN A',
      balance: 150000000, // 150 triệu
      currency: 'VND',
      type: 'CURRENT',
    },
    {
      id: 'acc_tcb_01',
      bankId: 'TCB', // VietQR bank code
      accountNumber: '19031234567890',
      accountName: 'NGUYEN VAN A',
      balance: 50000000, // 50 triệu
      currency: 'VND',
      type: 'SAVINGS',
    },
    {
      id: 'acc_mb_01',
      bankId: 'MB', // VietQR bank code
      accountNumber: '0801234567890',
      accountName: 'NGUYEN VAN A',
      balance: 25000000, // 25 triệu
      currency: 'VND',
      type: 'CURRENT',
    },
  ],
};

export const MOCK_TRANSACTIONS: Record<string, BankTransaction[]> = {
  acc_vcb_01: [
    {
      id: 'tx_01',
      accountId: 'acc_vcb_01',
      amount: 15000000,
      type: 'IN',
      description: 'LUONG THANG 03/2026',
      date: new Date('2026-03-30'),
      beneficiary: 'CTY TNHH ABC',
    },
    {
      id: 'tx_02',
      accountId: 'acc_vcb_01',
      amount: 500000,
      type: 'OUT',
      description: 'THANH TOAN TIEN DIEN T3',
      date: new Date('2026-04-01'),
      beneficiary: 'EVN HA NOI',
    },
    {
      id: 'tx_03',
      accountId: 'acc_vcb_01',
      amount: 850000,
      type: 'OUT',
      description: 'MUA SAM SHOPEE',
      date: new Date('2026-04-02'),
      beneficiary: 'SHOPEE VN',
    },
    {
      id: 'tx_04',
      accountId: 'acc_vcb_01',
      amount: 2000000,
      type: 'OUT',
      description: 'CHUYEN TIEN CHO B',
      date: new Date('2026-04-03'),
      beneficiary: 'NGUYEN VAN B - BIDV',
    },
    {
      id: 'tx_05',
      accountId: 'acc_vcb_01',
      amount: 1500000,
      type: 'IN',
      description: 'NHAN TIEN TU C',
      date: new Date('2026-04-04'),
      beneficiary: 'TRAN VAN C - MB',
    },
    {
      id: 'tx_06',
      accountId: 'acc_vcb_01',
      amount: 300000,
      type: 'OUT',
      description: 'THANH TOAN GRAB',
      date: new Date('2026-04-05'),
      beneficiary: 'GRAB VN',
    },
  ],
  acc_tcb_01: [
    {
      id: 'tx_10',
      accountId: 'acc_tcb_01',
      amount: 50000000,
      type: 'IN',
      description: 'GUI TIET KIEM KY HAN 6 THANG',
      date: new Date('2025-12-01'),
    },
    {
      id: 'tx_11',
      accountId: 'acc_tcb_01',
      amount: 1250000,
      type: 'IN',
      description: 'TIEN LAI TIET KIEM',
      date: new Date('2026-03-01'),
    },
  ],
  acc_mb_01: [
    {
      id: 'tx_20',
      accountId: 'acc_mb_01',
      amount: 10000000,
      type: 'IN',
      description: 'CHUYEN TIEN TU VCB',
      date: new Date('2026-03-15'),
      beneficiary: 'NGUYEN VAN A - VCB',
    },
    {
      id: 'tx_21',
      accountId: 'acc_mb_01',
      amount: 1200000,
      type: 'OUT',
      description: 'THANH TOAN HOA DON NUOC',
      date: new Date('2026-04-01'),
      beneficiary: 'CONG TY CP NUOC SACH',
    },
  ],
};
