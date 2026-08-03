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
        background: 'var(--color-teal-glow)',
        border: '1px solid var(--color-teal-border)',
        color: 'var(--color-teal-bright)',
      }}
    >
      <Icon size={11} />
      {label}
    </span>
  );
}
