import useSWR from 'swr';
import { swrFetcher } from '../api/client.js';
import { computeStreaks } from '../lib/streaks.js';
import {
  buildCells,
  level,
  monthLabels,
  dedupeOverlappingLabels,
  formatDayDescription,
  WEEKDAY_LABELS,
} from '../lib/activityHeatmap.js';
import { FlameIcon } from './Icon.js';
import type { DailyActivity } from '../lib/streaks.js';

interface DailyRow extends DailyActivity {
  session_seconds: number;
}

const DAYS = 365;
const LABEL_COL = 32;
const MONTH_ROW = 18;
const GAP = 3;
const CELL_SIZE = 21;
const MIN_LABEL_COL_GAP = 2;

const LEVEL_BG = [
  '#14212B',
  '#0D4A4B',
  '#08706D',
  '#05AFA6',
  '#00D9CC',
];

function StreakStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'teal' | 'muted';
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        className="text-faint"
        style={{ fontSize: 'var(--text-xs)' }}
      >
        {label}
      </div>

      <div
        className="tabular"
        style={{
          fontSize: 'var(--text-lg)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color:
            tone === 'teal'
              ? 'var(--color-teal)'
              : 'var(--color-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
        }}
      >
        {tone === 'teal' && <FlameIcon size={12} />}
        {value}
      </div>
    </div>
  );
}

export function ActivityHeatmap() {
  const { data } = useSWR<DailyRow[]>(
    `/stats/daily?days=${DAYS}`,
    swrFetcher,
    {
      revalidateOnFocus: false,
    },
  );

  if (!data || data.length === 0) return null;

  const byDate = new Map(
    data.map((d) => [
      d.date.slice(0, 10),
      Number(d.chapters_read),
    ]),
  );

  const streaks = computeStreaks(data);

  const totalChapters = data.reduce(
    (sum, d) => sum + Number(d.chapters_read),
    0,
  );

  const cells = buildCells(byDate);

  // Number of actual Sunday-first week columns required.
  // This prevents an unnecessary empty 53rd column when only 52
  // weeks are needed.
  const weekCount = Math.ceil(cells.length / 7);

  const labels = dedupeOverlappingLabels(
    monthLabels(cells),
    MIN_LABEL_COL_GAP,
  );

  const summary =
    `Reading activity heatmap: ${totalChapters} chapters over ` +
    `the last 365 days, current streak ${streaks.current} days, ` +
    `best streak ${streaks.longest} days.`;

  return (
    <div
      className="panel"
      style={{
        borderRadius: 'var(--radius-xl)',
        padding: 20,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
            }}
          >
            Reading Activity
          </h2>

          <div
            className="text-muted tabular"
            style={{ fontSize: 'var(--text-xs)' }}
          >
            {totalChapters.toLocaleString()} chapters · Last 365 days
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          <StreakStat
            label="Current streak"
            value={streaks.current}
            tone="teal"
          />

          <StreakStat
            label="Best streak"
            value={streaks.longest}
            tone="muted"
          />
        </div>
      </div>

      <div
        role="img"
        aria-label={summary}
        className="activity-heatmap-grid"
        style={{
          display: 'grid',

          // 1 label column + only the number of week columns
          // actually required by the 365-day range.
          gridTemplateColumns:
            `${LABEL_COL}px repeat(${weekCount}, ${CELL_SIZE}px)`,

          // Exactly 7 activity rows.
          // Row 1 = month labels
          // Rows 2–8 = Sun → Sat
          gridTemplateRows:
            `${MONTH_ROW}px repeat(7, ${CELL_SIZE}px)`,

          columnGap: `var(--heatmap-gap, ${GAP}px)`,
          rowGap: `var(--heatmap-gap, ${GAP}px)`,

          width: 'fit-content',
        }}
      >
        {/* Weekday labels — these occupy activity rows, not extra rows. */}
        {WEEKDAY_LABELS.map((w) => (
          <span
            key={w.label}
            className="text-faint"
            style={{
              gridColumn: 1,
              gridRow: w.row + 2,
              alignSelf: 'center',
              fontSize: 10,
            }}
          >
            {w.label}
          </span>
        ))}

        {/* Month labels */}
        {labels.map((m) => (
          <span
            key={`${m.label}-${m.col}`}
            className="text-faint"
            style={{
              gridColumn: m.col + 2,
              gridRow: 1,
              fontSize: 10,
            }}
          >
            {m.label}
          </span>
        ))}

        {/* Activity cells — always exactly 7 possible rows. */}
        {cells.map((c, i) => {
          const weekIndex = Math.floor(i / 7);
          const dayRow = i % 7;

          // Column 1 is reserved for weekday labels.
          const gridColumn = weekIndex + 2;

          // Row 1 is reserved for month labels.
          // Therefore activity rows are strictly 2–8.
          const gridRow = dayRow + 2;

          if (c.date === null) {
            return (
              <div
                key={c.key}
                style={{
                  gridColumn,
                  gridRow,
                  width: '100%',
                  height: '100%',
                }}
              />
            );
          }

          return (
            <div
              key={c.key}
              title={formatDayDescription(c.date, c.chapters)}
              style={{
                gridColumn,
                gridRow,
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
                borderRadius: 3,
                background: LEVEL_BG[level(c.chapters)],
              }}
            />
          );
        })}
      </div>

      <ul className="sr-only">
        {cells
          .filter((c) => c.date !== null)
          .map((c) => (
            <li key={c.key}>
              {formatDayDescription(c.date!, c.chapters)}
            </li>
          ))}
      </ul>

      <div
        className="text-faint"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 8,
          fontSize: 'var(--text-xs)',
        }}
      >
        Less

        {LEVEL_BG.map((bg, i) => (
          <span
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: bg,
              display: 'inline-block',
            }}
          />
        ))}

        More
      </div>
    </div>
  );
}