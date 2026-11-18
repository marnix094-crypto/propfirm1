import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Copy, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/panel';
import { toast } from '@/components/ui/toaster';
import { useCertificates } from '@/hooks/use-features';
import { CertificateCard } from './certificate-card';

export const verifyUrl = (lang: string | undefined, id: string) =>
  `${window.location.origin}/${lang ?? 'en'}/verify/${id}`;

/** Certificates for funded accounts: printable, with a public verification link. */
export function CertificatesPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const certs = useCertificates();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('app.nav.certificates')}
        subtitle={t('certificates.subtitle')}
        actions={
          (certs.data?.items.length ?? 0) > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden="true" /> {t('certificates.print')}
            </Button>
          ) : undefined
        }
      />
      {certs.isPending ? (
        <Skeleton className="h-72" />
      ) : certs.isError ? (
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void certs.refetch()}
        />
      ) : certs.data.items.length === 0 ? (
        <EmptyState
          title={t('certificates.empty')}
          body={t('certificates.emptyBody')}
          action={
            <Button size="sm" asChild>
              <Link to={`/${lang}/app/new-account`}>{t('app.nav.newAccount')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {certs.data.items.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <CertificateCard c={c} verifyUrl={verifyUrl(lang, c.id)} />
              <Button
                size="sm"
                variant="ghost"
                className="self-start print:hidden"
                onClick={() => {
                  void navigator.clipboard?.writeText(verifyUrl(lang, c.id));
                  toast({ kind: 'success', title: t('certificates.copied') });
                }}
              >
                <Copy aria-hidden="true" /> {t('certificates.copyLink')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
