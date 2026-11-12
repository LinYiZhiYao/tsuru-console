import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface StatusDotProps {
  status: string;
  size?: number;
}

const COLORS: Record<string, string> = {
  online: '#0f9d70',
  offline: '#dc2f4b',
  connecting: '#d97706',
  error: '#dc2f4b',
  unknown: '#8b94a3',
};

/**
 * 状态指示点。
 * 在线时加一圈扩散脉冲，让「活着」这件事有视觉存在感，
 * 而不是一个静态圆点（静止的绿点看不出是否在更新）。
 */
export function StatusDot({ status, size = 7 }: StatusDotProps) {
  const color = COLORS[status] ?? COLORS.unknown;
  const pulse = status === 'online';

  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size + 6, height: size + 6 }}>
      {pulse && (
        <motion.span
          className="absolute rounded-full"
          style={{ width: size, height: size, background: color, opacity: 0.5 }}
          animate={{ scale: [1, 2.2, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <motion.span
        className="rounded-full relative"
        style={{ width: size, height: size, background: color }}
        animate={{ opacity: status === 'unknown' ? 0.5 : 1 }}
        transition={{ duration: 0.3 }}
      />
    </span>
  );
}

interface ChipProps {
  children: ReactNode;
  color?: string;
  bg?: string;
  icon?: ReactNode;
  mono?: boolean;
}

export function Chip({ children, color = '#5b6473', bg = 'rgba(16,24,40,0.045)', icon, mono }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-[20px] px-1.5 rounded-[5px] text-[10.5px] font-medium whitespace-nowrap ${
        mono ? 'font-mono' : ''
      }`}
      style={{ color, background: bg }}
    >
      {icon}
      {children}
    </span>
  );
}

/** 数值 + 上限的横向进度条，超阈值变色 */
export function MiniBar({
  value,
  max,
  warnAt = 75,
  critAt = 90,
  height = 4,
}: {
  value: number;
  max: number;
  warnAt?: number;
  critAt?: number;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= critAt ? '#dc2f4b' : pct >= warnAt ? '#d97706' : '#0f9d70';

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height, background: 'rgba(16,24,40,0.08)' }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** 空状态占位 */
export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(16,24,40,0.035)', border: '1px solid rgba(16,24,40,0.055)' }}
      >
        {icon}
      </div>
      <h3 className="text-[14px] font-medium text-[#12171f] mb-1.5">{title}</h3>
      {desc && <p className="text-[12px] text-[#8b94a3] max-w-[320px] leading-relaxed mb-4">{desc}</p>}
      {action}
    </motion.div>
  );
}

/** 骨架屏行 */
export function SkeletonRows({ rows = 5, height = 48 }: { rows?: number; height?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05, duration: 0.2 }}
          className="flex items-center gap-3 px-3"
          style={{ height }}
        >
          <div className="skeleton w-2 h-2 rounded-full" />
          <div className="skeleton h-3 flex-1 max-w-[160px]" />
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-3 w-14" />
        </motion.div>
      ))}
    </div>
  );
}
