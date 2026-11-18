import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CircleX } from 'lucide-react';
import { Skeleton } from '@/components/ui/feedback';
import { SiteHeader } from '@/components/layout/site-header';
import { usePublicCertificate } from '@/hooks/use-features';
import { CertificateCard } from './certificate-card';
import { verifyUrl } from './certificates-page';

/** Public certificate verification (no login; shows nickname/anonymous label only). */
export function VerifyCertificatePage() {
  const { t } = useTranslation();
  const { lang, id } = useParams();
  const cert = usePublicCertificate(id);
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <title>{t('certificates.verifyTitle')}</title>
        <h1 className="text-2xl font-semibold tracking-tight">{t('certificates.verifyTitle')}</h1>
        {cert.isPending ? (
          <Skeleton className="h-72" />
        ) : cert.isError ? (
          <p role="alert" className="flex items-center gap-2 font-medium text-loss">
            <CircleX className="size-5" aria-hidden="true" /> {t('certificates.invalid')}
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium text-profit" role="status">
              <BadgeCheck className="size-5" aria-hidden="true" /> {t('certificates.valid')}
            </p>
            <CertificateCard c={cert.data} verifyUrl={verifyUrl(lang, cert.data.id)} />
            <p className="text-xs text-muted">{t('certificates.verifyNote')}</p>
          </>
        )}
        <Link to={`/${lang}`} className="text-sm font-semibold text-link hover:underline">
          {t('common.backHome')}
        </Link>
      </main>
    </>
  );
}
