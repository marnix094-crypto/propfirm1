import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FloatingCardProps {
  children: ReactNode;
  className?: string;
}

/** Glass notification card with a gentle idle float (disabled with reduced motion). */
export function FloatingCard({ children, className }: FloatingCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn('glass rounded-[20px] border border-border p-4 shadow-float', className)}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -8, 0] }}
      transition={
        reduce
          ? { duration: 0.3 }
          : { opacity: { duration: 0.5 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }
      }
    >
      {children}
    </motion.div>
  );
}
