import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { LOAN_PURPOSE_ENUM, COLLATERAL_TYPE_ENUM } from '@constant/p2p-lending.enum';

export class CreateLoanRequestDto {
    @ApiProperty({ description: 'Số tiền muốn vay (USDT)', example: 1000 })
    @IsNumber()
    @Min(100)
    @Max(50000)
    loanAmount: number;

    @ApiProperty({ description: 'Lãi suất đề xuất (%/năm)', example: 12 })
    @IsNumber()
    @Min(1)
    @Max(50)
    interestRate: number;

    @ApiProperty({ description: 'Thời hạn vay (ngày)', example: 30 })
    @IsNumber()
    @IsEnum([7, 14, 30, 60, 90, 120, 180, 270, 365])
    durationDays: number;

    @ApiProperty({ description: 'Mục đích vay', enum: LOAN_PURPOSE_ENUM })
    @IsEnum(LOAN_PURPOSE_ENUM)
    purpose: LOAN_PURPOSE_ENUM;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    purposeDescription?: string;

    @ApiProperty({ description: 'Loại tài sản thế chấp', enum: COLLATERAL_TYPE_ENUM })
    @IsEnum(COLLATERAL_TYPE_ENUM)
    collateralType: COLLATERAL_TYPE_ENUM;

    @ApiProperty({ description: 'Số lượng collateral (ETH)', example: '0.5' })
    @IsOptional()
    @IsNumber()
    collateralAmount?: number;

    @ApiProperty({ description: 'ID của LoanRequest trên Smart Contract' })
    @IsOptional()
    @IsNumber()
    onChainRequestId?: number;
}
