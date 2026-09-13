import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, IsBoolean } from 'class-validator';
export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class ResetUserPasswordDto {
  @IsString()
  @IsOptional()
  @MinLength(6)
  newPassword?: string;
}
