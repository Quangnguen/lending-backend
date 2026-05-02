import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class FundLoanDto {
    @ApiProperty({ description: 'Transaction hash từ blockchain' })
    @IsString()
    txHash: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    loanContractAddress?: string;
}
