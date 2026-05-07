import type { DeviceType } from '../types/index.js';
import { SmartphoneIcon, MonitorIcon } from './Icon.js';

interface Props {
  label: string;
  type?: DeviceType;
  lastSeen?: string;
  className?: string;
}

export function DeviceBadge({ label, type, className = '' }: Props) {
  const Icon = type === 'mobile' ? SmartphoneIcon : MonitorIcon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'var(--color-text-muted)',
      }}
    >
      <Icon size={11} />
      {label}
    </span>
  );
}
