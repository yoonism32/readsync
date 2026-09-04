import { Link } from 'react-router-dom';
import { coverUrl, resumeUrl } from '../api/client.js';
import { StatusDot } from './BehindBadge.js';
import { StarIcon } from './Icon.js';
import { behindCount } from '../lib/behindStatus.js';
import { compactAge } from '../lib/dateFormat.js';
import { updatedAt } from '../lib/novelSort.js';
import type { Novel, NovelStatus } from '../types/index.js';

const STATUS_OPTIONS: NovelStatus[] = ['reading', 'plan-to-read', 'completed', 'on-hold', 'dropped', 'removed'];

const ordinal = (n: number): string =>
  n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

export function Th({ label, sortable, active, asc, onClick, align = 'center', toggle, width }: {
  label: string; sortable?: boolean; active?: boolean; asc?: boolean;
  onClick?: () => void; align?: 'left' | 'center';
  /** Optional sort-mode switch rendered next to the label, hidden until the
   *  header is hovered/focused (see .progress-mode-toggle in index.css). */
  toggle?: { active: boolean; symbol: string; title: string; onClick: () => void };
  /** Pin fixed-content columns to their real width so table auto-layout
   *  doesn't spread a wider container's extra space across every column —
   *  Title is computed and passed in the same way (see MyList.tsx). The
   *  table itself has no width:100%, so there's no leftover space for the
   *  auto-layout algorithm to redistribute into any column. */
  width?: number;
}) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      className={toggle ? 'th-progress' : undefined}
      style={{
        padding: '10px 12px', textAlign: align, whiteSpace: 'nowrap', width,
        fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
        color: active ? 'var(--color-accent-bright)' : 'var(--color-text-muted)',
        cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      {label}{active && (asc ? ' ▲' : ' ▼')}
      {toggle && (
        <button
          type="button"
          className={`progress-mode-toggle${toggle.active ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); toggle.onClick(); }}
          title={toggle.title}
          aria-label={toggle.title}
          style={{
            marginLeft: 6, background: 'none', border: 'none', padding: 0,
            fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer', verticalAlign: 'middle',
          }}
        >
          {toggle.symbol}
        </button>
      )}
    </th>
  );
}

export function Row({ novel: n, onSetStatus, onToggleFav, titleWidth }: {
  novel: Novel;
  onSetStatus: (id: string, s: NovelStatus) => void;
  onToggleFav: (n: Novel) => void;
  /** Mirrors the Title column's autofit width (see Th's onAutofit) so the
   *  body cells don't hold the column open at their 220px default minimum. */
  titleWidth?: number;
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
      {/* Star + read-through pill + behind-badge must always sit on the title's
          line — never wrap below it. The actual bug was the title text itself
          line-wrapping inside its own flex item (no white-space rule on the
          Link), which pushed the flex row over height and dropped the badges
          to a new line. `white-space: nowrap` on the Link stops that; no
          truncation needed — this is a real <table>, so the Title column's
          width is shared across every row and the whole table (wrapped in an
          overflow-x:auto container, see MyList.tsx) scrolls as one unit when
          a long title needs more room, instead of any single row growing on
          its own. */}
      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: titleWidth ?? 220, width: titleWidth }}>
        {/* inline-flex, not flex: it must shrink-wrap to its own content so
            scrollWidth (used by the Title column's autofit, see MyList.tsx)
            reflects the text's real width instead of the stretched cell. */}
        <span data-col="title" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
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
            className="btn-accent"
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
