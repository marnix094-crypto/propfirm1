import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '@brand/shared';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'trader@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'NL', description: 'ISO 3166-1 alpha-2' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  country!: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale!: string;

  @ApiProperty({ description: 'Must be true' })
  @Equals(true)
  acceptTerms!: boolean;
}

export class LoginDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    enum: ['client', 'admin'],
    description:
      'client (default) = trading platform; admin = firm admin / Daily Funded staff (D91)',
  })
  @IsOptional()
  @IsIn(['client', 'admin'])
  audience?: 'client' | 'admin';
}

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() locale!: string;
  @ApiProperty() country!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() twoFactorEnabled!: boolean;
  @ApiProperty({
    enum: ['OWNER', 'ADMIN', 'SUPPORT'],
    nullable: true,
    description: 'Admin-panel role in the firm (null = trader only)',
  })
  firmRole!: 'OWNER' | 'ADMIN' | 'SUPPORT' | null;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Seconds' }) expiresIn!: number;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}

export class LoginResponseDto {
  @ApiPropertyOptional() accessToken?: string;
  @ApiPropertyOptional({ description: 'Seconds' }) expiresIn?: number;
  @ApiPropertyOptional({ type: UserDto }) user?: UserDto;
  @ApiPropertyOptional({ description: 'Password OK; a 2FA code is required next' })
  mfaRequired?: boolean;
  @ApiPropertyOptional({ description: 'Pass to /auth/2fa/verify (valid 5 minutes)' })
  mfaToken?: string;
}

export class MfaVerifyDto {
  @ApiProperty() @IsString() @MaxLength(2000) mfaToken!: string;
  @ApiPropertyOptional({ description: '6-digit authenticator code' })
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
  @ApiPropertyOptional({ description: 'One of the recovery codes' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recoveryCode?: string;
}

export class TokenDto {
  @ApiProperty() @IsString() @Length(20, 200) token!: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @Transform(lower) @IsEmail() email!: string;
  @ApiPropertyOptional({ enum: ['client', 'admin'], description: 'client (default) or admin' })
  @IsOptional()
  @IsIn(['client', 'admin'])
  audience?: 'client' | 'admin';
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @Length(20, 200) token!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(128) currentPassword!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
  @ApiPropertyOptional({ description: 'Required when 2FA is enabled' })
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}

export class TwoFactorSetupDto {
  @ApiProperty({ description: 'Base32 secret for manual entry' }) secret!: string;
  @ApiProperty() otpauthUri!: string;
}

export class TwoFactorCodeDto {
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}

export class TwoFactorDisableDto {
  @ApiProperty() @IsString() @MaxLength(128) password!: string;
  @ApiProperty() @Matches(/^\d{6}$/) code!: string;
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String], description: 'Shown once. Each code works one time.' })
  recoveryCodes!: string[];
}

export class SessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() lastUsedAt!: string;
  @ApiProperty() current!: boolean;
}
