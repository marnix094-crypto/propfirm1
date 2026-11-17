import { FlaskConical } from 'lucide-react';

/** Always visible while MSW mock data is active, so example data is never mistaken for real data. */
export function MockDataIndicator() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-[4.5rem] right-3 z-50 lg:top-auto lg:bottom-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border-strong bg-card px-3 py-1.5 text-xs font-semibold text-accent shadow-card"
    >
      <FlaskConical className="size-3.5" aria-hidden="true" />
      Mock data (dev)
    </div>
  );
}
