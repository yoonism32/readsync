interface Props {
  percent: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({ percent, showLabel = false, size = 'sm', className = '' }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const h = size === 'sm' ? 2 : 4;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(clamped)}% complete`}
        style={{
          height: h,
          flex: 1,
          borderRadius: 9999,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: clamped >= 100
              ? 'var(--color-success)'
              : 'linear-gradient(90deg, var(--color-accent-dim), var(--color-accent))',
            borderRadius: 'inherit',
            transition: 'width 0.4s var(--ease-out-expo)',
          }}
        />
      </div>
      {showLabel && (
        <span
          className="tabular text-muted shrink-0"
          style={{ fontSize: 'var(--text-xs)', minWidth: '3ch' }}
        >
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
