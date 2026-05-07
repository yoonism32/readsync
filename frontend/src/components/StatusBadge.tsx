import type { NovelStatus } from '../types/index.js';

interface Props {
  status: NovelStatus;
  className?: string;
}

const CONFIG: Record<NovelStatus, { label: string; bg: string; color: string }> = {
  reading:   { label: 'Reading',   bg: 'var(--color-info-dim)',    color: 'var(--color-info)' },
  completed: { label: 'Completed', bg: 'var(--color-success-dim)', color: 'var(--color-success)' },
  'on-hold': { label: 'On Hold',   bg: 'var(--color-warning-dim)', color: 'var(--color-warning)' },
  dropped:   { label: 'Dropped',   bg: 'var(--color-danger-dim)',  color: 'var(--color-danger)' },
  removed:   { label: 'Removed',   bg: 'rgba(255,255,255,0.05)',   color: 'var(--color-text-muted)' },
};

export function StatusBadge({ status, className = '' }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.removed;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}
