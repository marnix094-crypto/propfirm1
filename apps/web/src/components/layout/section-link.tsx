import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

/**
 * Link to a section of the example storefront (the prop-firm landing page built on the platform). Navigates inside the SPA (no full reload) and scrolls
 * once the landing page has rendered; works with any router type.
 */
export function SectionLink({
  id,
  children,
  className,
  onClick,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { lang } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <a
      href={`/${lang}/storefront#${id}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        if (location.pathname === `/${lang}/storefront`)
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        else void navigate(`/${lang}/storefront`, { state: { section: id } });
      }}
    >
      {children}
    </a>
  );
}
