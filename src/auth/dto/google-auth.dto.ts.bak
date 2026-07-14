import { IsEmail, IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '../../users/schema/Role_enum';

export class GoogleAuthDto {
  @IsOptional()
  @IsString()
  idToken?: string; // From mobile

  @IsOptional()
  @IsString()
  accessToken?: string; // From web

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole; // For new users signing up with Google
}