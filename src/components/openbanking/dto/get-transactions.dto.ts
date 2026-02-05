import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class GetTransactionsDto {
  @ApiProperty({ description: 'Bank Connection ID' })
  @IsNotEmpty()
  @IsString()
  connectionId: string;

  @ApiProperty({
    description: 'Start date for transactions in YYYY-MM-DD format',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date for transactions in YYYY-MM-DD format',
    required: false,
  })
  @IsDateString()
  endDate?: string;
}

export class TransactionDto {
  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  accountId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  merchantName?: string;

  @ApiProperty()
  category?: string[];

  @ApiProperty()
  pending: boolean;
}
