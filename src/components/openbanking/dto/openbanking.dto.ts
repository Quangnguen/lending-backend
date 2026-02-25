export interface Bank {
    id: string;
    name: string;
    shortName: string;
    logo: string;
}

export interface BankAccount {
    id: string;
    bankId: string;
    accountNumber: string;
    accountName: string;
    balance: number;
    currency: string;
    type: 'SAVINGS' | 'CURRENT';
}

export interface BankTransaction {
    id: string;
    accountId: string;
    amount: number;
    type: 'IN' | 'OUT';
    description: string;
    date: Date;
    beneficiary?: string;
}

export interface LinkBankDto {
    bankId: string;
    username: string;
    password?: string;
}

export interface VerifyOtpDto {
    transactionId: string;
    otp: string;
}

export interface BankConnectionResponse {
    success: boolean;
    message: string;
    transactionId?: string;
    data?: any;
}