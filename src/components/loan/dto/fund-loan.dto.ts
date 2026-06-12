import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class FundLoanDto {
  @ApiProperty({ description: 'Transaction hash từ blockchain' })
  @IsString()
  txHash: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  loanContractAddress?: string;

  @ApiProperty({
    required: false,
    description: 'On-chain request ID để kiểm tra trạng thái trên blockchain',
  })
  @IsOptional()
  @IsNumber()
  onChainRequestId?: number;
}
