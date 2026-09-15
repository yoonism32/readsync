import { Link } from 'react-router-dom';
import { coverUrl, resumeUrl } from '../api/client.js';
import { StatusDot } from './BehindBadge.js';
import { StarIcon } from './Icon.js';
import { behindCount } from '../lib/behindStatus.js';
import { compactAge } from '../lib/dateFormat.js';
import { updatedAt } from '../lib/novelSort.js';
import { STATUS_OPTIONS } from '../lib/novelStatus.js';
import type { Novel, NovelStatus } from '../types/index.js';

const ordinal = (n: number): string =>
  n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

export function Th({ label, sortable, active, asc, onClick, align = 'center', toggle, width }: {
  label: string; sortable?: boolean; active?: boolean; asc?: boolean;
  onClick?: () => void; align?: 'left' | 'center';
  /** Optional sort-mode switch rendered next to the label, hidden until the
   *  header is hovered/focused (see .progress-mode-toggle in index.css). */
  toggle?: { active: boolean; symbol: string; title: string; onClick: () => void };
  width?: number;
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      className={toggle ? 'th-progress' : undefined}
      style={{
        padding: toggle ? '10px 32px' : '10px 12px', textAlign: align, whiteSpace: 'nowrap', width,
        position: toggle ? 'relative' : undefined,
        fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
        color: active ? 'var(--color-accent-bright)' : 'var(--color-text-muted)',
        cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      <span>{label}{active && (asc ? ' ▲' : ' ▼')}</span>
      {toggle && (
        <button
          type="button"
          className={`progress-mode-toggle${toggle.active ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); toggle.onClick(); }}
          title={toggle.title}
          aria-label={toggle.title}
          style={{
            position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', padding: 0, lineHeight: 1,
            fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
          }}
        >
          {toggle.symbol}
        </button>
      )}
    </th>
  );
}

export function Row({ novel: n, onSetStatus, onToggleFav, titleWidth, selected, onToggleSelect }: {
  novel: Novel;
  onSetStatus: (id: string, s: NovelStatus) => void;
  onToggleFav: (n: Novel) => void;
  titleWidth?: number;
  /** Bulk-selection checkbox. Omitted entirely (no cell rendered) when the
   *  caller doesn't pass onToggleSelect, so callers that don't need bulk
   *  actions keep the table's original column count. */
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const behind = behindCount(n);
  const continueHref = n.latest_url
    ? resumeUrl(n.latest_url, n.latest_percent)
    : n.primary_url ?? null;

  const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' };

  return (
    <tr
      className="row-hover"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {/* Bulk-selection checkbox — omitted when the caller doesn't opt in. */}
      {onToggleSelect && (
        <td style={{ ...td, width: 36 }}>
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onToggleSelect(n.novel_id)}
            aria-label={`Select ${n.title}`}
          />
        </td>
      )}

      {/* Cover */}
      <td style={{ ...td, width: 70 }}>
        <a href={continueHref ?? '#'} target="_blank" rel="noopener noreferrer" aria-label={`Open ${n.title} on site`}>
          <span style={{
            position: 'relative', display: 'inline-block', width: 44, height: 62, borderRadius: 5,
            overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', verticalAlign: 'middle',
          }}>
            <img
              src={coverUrl(n.novel_id)} alt="" width={44} height={62} loading="lazy"
              onError={e => { e.currentTarget.style.display = 'none'; }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </span>
        </a>
      </td>

      {/* Title */}
      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: titleWidth ?? 220, width: titleWidth }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
          <Link
            to={`/novel/${encodeURIComponent(n.novel_id)}`}
            className="link-accent"
            style={{
              fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)', textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {n.title}
          </Link>
          <button
            type="button"
            onClick={() => onToggleFav(n)}
            aria-label={n.favorite ? 'Unfavorite' : 'Favorite'}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: n.favorite ? 'var(--color-warning)' : 'var(--color-text-faint)', lineHeight: 1, flexShrink: 0 }}
          >
            <StarIcon size={12} filled={n.favorite} />
          </button>
          {(n.current_read_through ?? 1) > 1 && (
            <span style={{
              fontSize: 'var(--text-xs)', color: 'var(--color-accent-bright)', background: 'var(--color-accent-glow)',
              border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-full)', padding: '0 8px',
              flexShrink: 0,
            }}>
              {ordinal(n.current_read_through)} read
            </span>
          )}
          {behind > 0 && (
            <span className="tabular" style={{
              fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-on-teal)',
              background: 'var(--color-teal)', borderRadius: 'var(--radius-full)', padding: '1px 8px',
              flexShrink: 0,
            }}>
              +{behind}
            </span>
          )}
        </span>
        {n.latest_chapter != null && (
          <span className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs)', marginTop: 3 }}>
            <StatusDot novel={n} /> Last ch. {n.latest_chapter}
          </span>
        )}
      </td>

      {/* Progress */}
      <td className="tabular" style={{ ...td, fontSize: 'var(--text-sm)' }}>
        {n.latest_chapter ?? 0} / {n.latest_chapter_num ?? '?'}
      </td>

      {/* Continue */}
      <td style={td}>
        {continueHref ? (
          <a
            href={continueHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            style={{ textDecoration: 'none', fontSize: 'var(--text-xs)', padding: '6px 12px', display: 'inline-block' }}
          >
            Continue Reading →
          </a>
        ) : (
          <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={td}>
        <select
          value={n.status}
          onChange={e => onSetStatus(n.novel_id, e.target.value as NovelStatus)}
          aria-label={`Status of ${n.title}`}
          style={{
            background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', padding: '5px 8px',
            color: 'var(--color-text)', fontSize: 'var(--text-xs)', cursor: 'pointer', outline: 'none',
          }}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </td>

      {/* Times */}
      <td className="tabular text-muted" style={{ ...td, fontSize: 'var(--text-xs)' }}>{compactAge(n.latest_read_at)}</td>
      <td className="tabular text-muted" style={{ ...td, fontSize: 'var(--text-xs)' }}>{compactAge(updatedAt(n))}</td>
      <td className="tabular text-muted" style={{ ...td, fontSize: 'var(--text-xs)' }}>{compactAge(n.created_at)}</td>
    </tr>
  );
}
