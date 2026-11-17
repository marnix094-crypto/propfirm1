import { useTranslation } from 'react-i18next';
import { partners } from '@/config/brand';

/** Real partners only (D20). Renders nothing until partners are configured. */
export function Partners() {
  const { t } = useTranslation();
  if (partners.length === 0) return null;
  return (
    <section aria-label={t('landing.partners.label')} className="py-10">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-6 px-4 opacity-80 grayscale sm:px-6">
        {partners.map((p) => (
          <li key={p.name}>
            {p.href ? (
              <a href={p.href} rel="noopener" target="_blank">
                <img src={p.logoSrc} alt={p.name} className="h-7 w-auto" loading="lazy" />
              </a>
            ) : (
              <img src={p.logoSrc} alt={p.name} className="h-7 w-auto" loading="lazy" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
