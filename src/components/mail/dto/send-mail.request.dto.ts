import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';

class Context {}

class BodyMail {
  @ApiProperty({ example: 'subject mail' })
  @IsNotEmpty()
  @IsString()
  subject: string;

  @ApiProperty({ example: 'hello world' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({ example: './template-mail' })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiProperty({ example: { code: 'abc' } })
  @IsOptional()
  context?: Context;

  @ApiProperty({ example: { code: 'abc' } })
  @IsOptional()
  attachments?: any;
}

export class SendMailRequestDto {
  @ApiProperty({ example: 'example@gmail.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string | string[];

  @ApiProperty({
    example: {
      subject: 'subject mail',
      template: './template-mail',
      context: { code: 'abc' },
    },
  })
  @IsNotEmpty()
  body: BodyMail;
}
