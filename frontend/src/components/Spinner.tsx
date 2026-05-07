interface Props {
  size?: number;
  className?: string;
}

export function Spinner({ size = 20, className = '' }: Props) {
  return (
    <svg
      aria-label="Loading…"
      role="status"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin-gold ${className}`}
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.2"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="var(--color-gold)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
