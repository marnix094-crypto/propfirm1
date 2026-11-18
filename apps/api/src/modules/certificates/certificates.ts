import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { Public } from '../auth/public.decorator.js';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator.js';
import { anonymousName } from '../community/community.service.js';

export class CertificateDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['FUNDED'] }) type!: string;
  @ApiProperty() accountSizeMinor!: string;
  @ApiProperty() issuedAt!: string;
  @ApiProperty({ description: 'Public nickname or anonymous label (never a real name)' })
  holder!: string;
  @ApiProperty({ description: 'The account is simulated' }) simulated!: boolean;
}

export class CertificateListDto {
  @ApiProperty({ type: [CertificateDto] }) items!: CertificateDto[];
}

/** Certificates for funded accounts, created once per bought funded account. */
@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async sync(userId: string) {
    const accounts = await this.prisma.tradingAccount.findMany({
      where: { userId, kind: 'FUNDED', purchaseId: { not: null }, certificate: null },
      select: { id: true, initialBalanceMinor: true, createdAt: true },
    });
    if (accounts.length)
      await this.prisma.certificate.createMany({
        data: accounts.map((a) => ({
          userId,
          accountId: a.id,
          type: 'FUNDED',
          accountSizeMinor: a.initialBalanceMinor,
          issuedAt: a.createdAt,
        })),
        skipDuplicates: true,
      });
  }

  private async holder(userId: string) {
    const p = await this.prisma.traderProfile.findUnique({ where: { userId } });
    return p?.nickname ?? anonymousName(userId);
  }

  async list(userId: string): Promise<CertificateDto[]> {
    await this.sync(userId);
    const [rows, holder] = await Promise.all([
      this.prisma.certificate.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' } }),
      this.holder(userId),
    ]);
    return rows.map((c) => ({
      id: c.id,
      type: c.type,
      accountSizeMinor: c.accountSizeMinor.toString(),
      issuedAt: c.issuedAt.toISOString(),
      holder,
      simulated: true,
    }));
  }

  async verify(id: string): Promise<CertificateDto> {
    const c = await this.prisma.certificate.findUnique({ where: { id } });
    if (!c) throw Errors.notFound('Certificate');
    return {
      id: c.id,
      type: c.type,
      accountSizeMinor: c.accountSizeMinor.toString(),
      issuedAt: c.issuedAt.toISOString(),
      holder: await this.holder(c.userId),
      simulated: true,
    };
  }
}

@ApiTags('certificates')
@Controller()
export class CertificatesController {
  constructor(private readonly certs: CertificatesService) {}

  @Get('certificates')
  @ApiOkResponse({ type: CertificateListDto })
  async list(@CurrentUser() u: AuthUser): Promise<CertificateListDto> {
    return { items: await this.certs.list(u.id) };
  }

  @Public()
  @Get('public/certificates/:id')
  @ApiOkResponse({ type: CertificateDto })
  verify(@Param('id', new ParseUUIDPipe({ version: '7' })) id: string) {
    return this.certs.verify(id);
  }
}

@Module({ controllers: [CertificatesController], providers: [CertificatesService] })
export class CertificatesModule {}
