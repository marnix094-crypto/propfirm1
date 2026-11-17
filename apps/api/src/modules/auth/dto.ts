import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
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
}

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() locale!: string;
  @ApiProperty() country!: string;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Seconds' }) expiresIn!: number;
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
