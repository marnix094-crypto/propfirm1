import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class JournalEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) accountId!: string | null;
  @ApiProperty({ example: '2026-11-18' }) date!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class JournalPageDto {
  @ApiProperty({ type: [JournalEntryDto] }) items!: JournalEntryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class JournalQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID('7') cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-11-18' }) @Matches(DATE) date!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @MaxLength(10_000)
  body!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 8 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(24, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Trading account the note is about' })
  @IsOptional()
  @IsUUID('7')
  accountId?: string;
}

export class UpdateJournalEntryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) date?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10_000) body?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(24, { each: true })
  tags?: string[];
}
