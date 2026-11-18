import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

/**
 * Link to a landing-page section. Navigates inside the SPA (no full reload) and scrolls
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
      href={`/${lang}#${id}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        if (location.pathname === `/${lang}`)
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        else void navigate(`/${lang}`, { state: { section: id } });
      }}
    >
      {children}
    </a>
  );
}
