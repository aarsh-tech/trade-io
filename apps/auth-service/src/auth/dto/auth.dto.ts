import { IsEmail, IsString, MinLength, IsOptional, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Aarsh Patel' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'SecurePass123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123' })
  @IsString()
  password: string;

  @ApiProperty({ required: false, example: '123456' })
  @IsString()
  @IsOptional()
  totpCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class Verify2faDto {
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
