import { useId } from 'react';
import { brand } from '@/config/brand';
import { cn } from '@/lib/cn';

export function Logo({ className }: { className?: string }) {
  // Unique gradient id: several logos can be on a page (one may be display:none).
  const gid = `logo-g-${useId().replace(/:/g, '')}`;
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-bold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38BDF8" />
            <stop offset="1" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
        <path
          d="M8 20l5-5 4 3 7-8"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-lg">{brand.name}</span>
    </span>
  );
}
