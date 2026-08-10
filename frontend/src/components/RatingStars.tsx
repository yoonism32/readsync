import { useState } from 'react';
import { StarIcon } from './Icon.js';

interface RatingStarsProps {
  /** 0–5 in 0.5 increments. 0 means unrated. */
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  readOnly?: boolean;
}

const STAR_INDICES = [0, 1, 2, 3, 4];

function ratingFromClick(starIndex: number, event: React.MouseEvent<HTMLButtonElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const clickedLeftHalf = event.clientX - rect.left < rect.width / 2;
  return starIndex + (clickedLeftHalf ? 0.5 : 1);
}

/** Half-star click/hover rating widget. Renders a filled overlay clipped to
 *  0/50/100% width per star, since StarIcon itself has no partial-fill mode. */
export function RatingStars({ value, onChange, size = 20, readOnly = false }: RatingStarsProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;
  // Brighter while previewing a hover, settles to the base gold once committed.
  const fillColor = hoverValue !== null ? 'var(--color-gold-bright)' : 'var(--color-gold)';

  return (
    <div
      role={readOnly ? undefined : 'radiogroup'}
      aria-label="Rating"
      style={{ display: 'inline-flex', gap: 2 }}
      onMouseLeave={() => setHoverValue(null)}
    >
      {STAR_INDICES.map(i => {
        const fillFraction = Math.max(0, Math.min(1, displayValue - i));
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            role={readOnly ? undefined : 'radio'}
            aria-checked={!readOnly && value >= i + 1}
            aria-label={`${i + 1} star${i === 0 ? '' : 's'}`}
            onMouseMove={e => setHoverValue(ratingFromClick(i, e))}
            onClick={e => onChange?.(ratingFromClick(i, e))}
            style={{
              position: 'relative',
              display: 'block',
              background: 'none',
              border: 'none',
              padding: 0,
              lineHeight: 0,
              cursor: readOnly ? 'default' : 'pointer',
              color: 'var(--color-text-faint)',
            }}
          >
            <StarIcon size={size} />
            {fillFraction > 0 && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  overflow: 'hidden',
                  width: `${fillFraction * 100}%`,
                  color: fillColor,
                }}
              >
                <StarIcon size={size} filled />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
