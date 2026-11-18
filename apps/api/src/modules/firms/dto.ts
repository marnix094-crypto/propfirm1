import { ApiProperty } from '@nestjs/swagger';
import { CLIENT_MODULES, isClientModule, type ClientModule } from '@brand/shared';
import type { Firm } from '../../generated/prisma/client.js';

/** Public branding of the firm a request belongs to (no internal data). */
export class FirmBrandingDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'True for the Daily Funded default tenant' }) isDefault!: boolean;
  @ApiProperty({ type: String, nullable: true, description: '#RRGGBB or null (default lime)' })
  primaryColor!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Logo as data URL' })
  logoDataUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) supportEmail!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) status!: 'ACTIVE' | 'SUSPENDED';
  @ApiProperty({
    enum: CLIENT_MODULES,
    isArray: true,
    description: 'Client-dashboard modules switched off by the firm',
  })
  disabledModules!: ClientModule[];
}

export const toFirmBrandingDto = (f: Firm, defaultSlug: string): FirmBrandingDto => ({
  slug: f.slug,
  name: f.name,
  isDefault: f.slug === defaultSlug,
  primaryColor: f.primaryColor,
  logoDataUrl: f.logoDataUrl,
  supportEmail: f.supportEmail,
  status: f.status,
  disabledModules: f.disabledModules.filter(isClientModule),
});
