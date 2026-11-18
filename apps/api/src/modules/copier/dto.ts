import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CopierLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty() masterAccountId!: string;
  @ApiProperty() followerAccountId!: string;
  @ApiProperty({ description: 'Size factor in bps (10000 = 1×)' }) multiplierBps!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
}

export class CopyEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() linkId!: string;
  @ApiProperty() symbol!: string;
  @ApiProperty({ enum: ['BUY', 'SELL'] }) side!: string;
  @ApiProperty() qty!: string;
  @ApiProperty({ enum: ['COPIED', 'SKIPPED', 'FAILED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) code!: string | null;
  @ApiProperty() createdAt!: string;
}

export class CopierOverviewDto {
  @ApiProperty({ type: [CopierLinkDto] }) links!: CopierLinkDto[];
  @ApiProperty({ type: [CopyEventDto], description: 'Latest 50 copy results' })
  events!: CopyEventDto[];
}

export class CreateCopierLinkDto {
  @ApiProperty() @IsUUID('7') masterAccountId!: string;
  @ApiProperty() @IsUUID('7') followerAccountId!: string;
  @ApiProperty({ minimum: 1000, maximum: 50000, example: 10000 })
  @IsInt()
  @Min(1000)
  @Max(50000)
  multiplierBps!: number;
}

export class UpdateCopierLinkDto {
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() active?: boolean;
  @ApiProperty({ required: false, minimum: 1000, maximum: 50000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(50000)
  multiplierBps?: number;
}
