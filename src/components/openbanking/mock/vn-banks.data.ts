import { Bank, BankAccount, BankTransaction } from '../dto/openbanking.dto';

export const VN_BANKS: Bank[] = [
    {
        id: 'vcb',
        shortName: 'Vietcombank',
        name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'tcb',
        shortName: 'Techcombank',
        name: 'Ngân hàng TMCP Kỹ thương Việt Nam',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'mb',
        shortName: 'MB Bank',
        name: 'Ngân hàng TMCP Quân đội',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'bidv',
        shortName: 'BIDV',
        name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'vpbank',
        shortName: 'VPBank',
        name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'acb',
        shortName: 'ACB',
        name: 'Ngân hàng TMCP Á Châu',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'tpbank',
        shortName: 'TPBank',
        name: 'Ngân hàng TMCP Tiên Phong',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'vib',
        shortName: 'VIB',
        name: 'Ngân hàng TMCP Quốc tế Việt Nam',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'msb',
        shortName: 'MSB',
        name: 'Ngân hàng TMCP Hàng Hải Việt Nam',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    },
    {
        id: 'hdbank',
        shortName: 'HDBank',
        name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh',
        logo: 'https://i.pinimg.com/1200x/a2/9d/29/a29d290535c8a5fd55f67631c7e454f1.jpg'
    }
]

export const MOCK_ACCOUNTS: Record<string, BankAccount[]> = {
    'demo_user': [
        {
            id: 'acc_vcb_01',
            bankId: 'vcb',
            accountNumber: '0011001234567',
            accountName: 'NGUYEN VAN A',
            balance: 150000000, // 150 triệu
            currency: 'VND',
            type: 'CURRENT'
        },
        {
            id: 'acc_tcb_01',
            bankId: 'tcb',
            accountNumber: '19031234567890',
            accountName: 'NGUYEN VAN A',
            balance: 50000000, // 50 triệu
            currency: 'VND',
            type: 'SAVINGS'
        }
    ]
}

export const MOCK_TRANSACTIONS: Record<string, BankTransaction[]> = {
    'acc_vcb_01': [
        {
            id: 'tx_01',
            accountId: 'acc_vcb_01',
            amount: 5000000,
            type: 'IN',
            description: 'LUONG THANG 1',
            date: new Date('2026-01-30'),
            beneficiary: 'CTY ABC'
        },
        {
            id: 'tx_02',
            accountId: 'acc_vcb_01',
            amount: 200000,
            type: 'OUT',
            description: 'THANH TOAN DIEN',
            date: new Date('2026-02-01'),
            beneficiary: 'EVN'
        },
        {
            id: 'tx_03',
            accountId: 'acc_vcb_01',
            amount: 500000,
            type: 'OUT',
            description: 'MUA SAM SHOPEE',
            date: new Date('2026-02-02'),
            beneficiary: 'SHOPEE'
        },
        {
            id: 'tx_04',
            accountId: 'acc_vcb_01',
            amount: 1000000,
            type: 'OUT',
            description: 'CHUYEN TIEN',
            date: new Date('2026-02-03'),
            beneficiary: 'NGUYEN VAN B'
        },
    ],
    'acc_tcb_01': [
        {
            id: 'tx_05',
            accountId: 'acc_tcb_01',
            amount: 50000000,
            type: 'IN',
            description: 'GUI TIET KIEM',
            date: new Date('2025-12-01')
        },
    ]
}