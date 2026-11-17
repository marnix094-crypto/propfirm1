import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  /** Final value. bigint is supported (e.g. minor units); intermediate frames are display-only. */
  value: number | bigint;
  /** Formatter for both intermediate and final values. Final value is formatted from the exact input. */
  format: (value: number | bigint) => string;
  duration?: number;
  className?: string;
}

/**
 * Animates a number when it scrolls into view.
 * Layout-shift free: an invisible copy of the final value reserves the width.
 */
export function CountUp({ value, format, duration = 1.4, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const final = format(value);
  const [display, setDisplay] = useState<string>(() =>
    reduce ? final : format(typeof value === 'bigint' ? 0n : 0),
  );

  useEffect(() => {
    if (!inView) return;
    if (reduce) return;
    const target = Number(value);
    const isBig = typeof value === 'bigint';
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(isBig ? BigInt(Math.round(v)) : v)),
      onComplete: () => setDisplay(final),
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration, final, format]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{final}</span>
      <span aria-hidden="true" className="relative inline-block tabular-nums">
        <span className="invisible">{final}</span>
        <span className="absolute inset-0 text-left whitespace-nowrap">
          {reduce ? final : display}
        </span>
      </span>
    </span>
  );
}
