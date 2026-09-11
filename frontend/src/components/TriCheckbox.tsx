import type { TriState } from '../lib/explorerFilters.js';

/**
 * Three-state filter box: unset → include → exclude → unset.
 * Include is teal (the app's discovery/activity colour), exclude is danger red
 * with a minus, so the two are distinguishable by shape as well as colour.
 */
export function TriCheckbox({
  label,
  state,
  onCycle,
}: {
  label: string;
  state: TriState;
  onCycle: () => void;
}) {
  const isInclude = state === 'include';
  const isExclude = state === 'exclude';

  const colour = isInclude
    ? 'var(--color-teal-bright)'
    : isExclude
      ? 'var(--color-danger)'
      : 'var(--color-text-muted)';

  return (
    <button
      type="button"
      className="tri-filter-chip"
      data-state={state}
      onClick={onCycle}
      // Not a checkbox role: three states, so aria-checked would be a lie.
      aria-pressed={state !== 'off'}
      aria-label={`${label}${isInclude ? ' — included' : isExclude ? ' — excluded' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: state === 'off' ? 'transparent' : isInclude ? 'var(--color-teal-glow)' : 'rgba(255, 90, 90, 0.08)',
        border: `1px solid ${state === 'off' ? 'var(--color-border)' : colour}`,
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        color: colour,
        fontSize: 'var(--text-sm)',
        fontFamily: 'inherit',
        fontWeight: state === 'off' ? 400 : 600,
        textAlign: 'left',
        cursor: 'pointer',
        touchAction: 'manipulation',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 15,
          height: 15,
          flexShrink: 0,
          borderRadius: 3,
          border: `1px solid ${state === 'off' ? 'var(--color-border)' : colour}`,
          background: state === 'off' ? 'transparent' : colour,
          color: isInclude ? 'var(--color-on-teal)' : 'var(--color-on-accent)',
        }}
      >
        {isInclude && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m20 6-11 11-5-5" />
          </svg>
        )}
        {isExclude && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        )}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}
