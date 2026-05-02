import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';

export class RepayLoanDto {
    @ApiProperty({ description: 'Transaction hash từ blockchain' })
    @IsString()
    txHash: string;

    @ApiProperty({ description: 'Số tiền trả' })
    @IsNumber()
    amount: number;
}
