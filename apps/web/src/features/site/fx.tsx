import { Fragment, useRef, type ReactNode } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { cn } from '@/lib/cn';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Headline that reveals word by word from behind a mask. */
export function WordReveal({
  text,
  className,
  delay = 0,
  wordClassName,
}: {
  text: string;
  className?: string;
  delay?: number;
  wordClassName?: string;
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className={cn('inline-block', wordClassName)}
              initial={reduce ? false : { y: '110%' }}
              animate={{ y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.06 }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </span>
  );
}

/** Slowly drifting grid with a lime glow, masked to fade out at the edges. */
export function GridBackdrop({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <motion.div
        className="site-grid absolute -inset-[64px]"
        animate={reduce ? undefined : { x: [0, 64], y: [0, 64] }}
        transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
      />
      <div className="absolute top-[-20%] left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(175_230_4/0.22),transparent)] blur-2xl" />
    </div>
  );
}

/** Infinite horizontal marquee (pauses on hover; static with reduced motion). */
export function Marquee({ items }: { items: string[] }) {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((it) => (
        <li key={it} className="flex items-center gap-10 whitespace-nowrap">
          <span className="font-display text-lg font-medium tracking-tight sm:text-2xl">{it}</span>
          <span aria-hidden="true" className="size-2 rotate-45 bg-primary" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="marquee group relative flex overflow-hidden border-y border-border py-6 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
      <div className="marquee-track flex">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** 3D tilt that follows the pointer (transform only; disabled with reduced motion). */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 16 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 120, damping: 16 });
  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      onPointerMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Card with a soft lime spotlight that follows the pointer (moved via transform). */
export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  return (
    <motion.div
      className={cn(
        'group relative overflow-hidden rounded-card border border-border bg-card transition-colors hover:border-border-strong',
        className,
      )}
      whileHover={reduce ? undefined : { y: -4 }}
      transition={{ duration: 0.3, ease: EASE }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left - 200);
        my.set(e.clientY - r.top - 200);
      }}
    >
      {!reduce && <Glow x={mx} y={my} />}
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function Glow({ x, y }: { x: MotionValue<number>; y: MotionValue<number> }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 size-[400px] rounded-full bg-[radial-gradient(closest-side,rgb(175_230_4/0.14),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      style={{ x, y }}
    />
  );
}

/** Small uppercase label above section titles. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-accent uppercase">
      <span aria-hidden="true" className="h-px w-6 bg-primary" />
      {children}
    </p>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn('max-w-3xl', className)}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {body && <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">{body}</p>}
    </motion.div>
  );
}
