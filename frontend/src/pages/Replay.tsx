import { Link, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { coverUrl, stats } from '../api/client.js';
import { LoadError } from '../components/PageFeedback.js';
import { Spinner } from '../components/Spinner.js';
import type { ReplayResponse, ReplayVisit } from '../types/index.js';

const MONTH_PATTERN = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function currentMonth(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-15T12:00:00Z`));
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function observedRange(visit: ReplayVisit): string {
  if (visit.from_chapter == null || visit.to_chapter == null) return 'Chapter position unavailable';
  if (visit.from_chapter === visit.to_chapter) return `Observed Ch. ${visit.from_chapter}`;
  return `Observed Ch. ${visit.from_chapter}–${visit.to_chapter}`;
}

function Fact({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="panel replay-fact">
      <strong className="tabular">{value} {label}</strong>
    </div>
  );
}

export function Replay() {
  const timezone = browserTimeZone();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get('month') ?? '';
  const month = MONTH_PATTERN.test(requestedMonth) ? requestedMonth : currentMonth(timezone);
  const { data, error, isLoading, mutate } = useSWR<ReplayResponse>(
    ['monthly-replay', month, timezone],
    () => stats.replay(month, timezone),
    { revalidateOnFocus: false },
  );

  const chooseMonth = (value: string) => {
    if (!MONTH_PATTERN.test(value)) return;
    const next = new URLSearchParams(searchParams);
    next.set('month', value);
    setSearchParams(next);
  };

  const hasActivity = (data?.summary.recorded_reading_days ?? 0) > 0;
  const hasMilestones = Boolean(
    data && (data.milestones.started.length > 0 || data.milestones.completed.length > 0),
  );

  return (
    <div className="page-view animate-fade-in replay-page">
      <header className="replay-header">
        <div>
          <p className="replay-kicker">Monthly Reading Replay</p>
          <h1 className="page-title">{monthLabel(month)}</h1>
          <p className="text-muted replay-timezone">Calendar days shown in {timezone}.</p>
        </div>
        <div className="replay-controls">
          <label htmlFor="replay-month">Replay month</label>
          <input
            id="replay-month"
            type="month"
            value={month}
            onChange={event => chooseMonth(event.target.value)}
          />
          <button type="button" className="btn-ghost replay-print" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="page-loading"><Spinner size={28} /><span>Loading replay…</span></div>
      ) : error ? (
        <LoadError subject="this reading replay" onRetry={() => { void mutate(); }} />
      ) : !data ? null : !hasActivity && !hasMilestones ? (
        <section className="panel replay-empty">
          <h2>No recorded activity for this month</h2>
          <p>
            This does not necessarily mean no reading happened. Tracking may have been unavailable,
            and offline activity can appear later on its upload date.
          </p>
        </section>
      ) : (
        <>
          <section className="replay-facts" aria-label="Month summary">
            <Fact value={data.summary.recorded_reading_days} label={`${data.summary.recorded_reading_days === 1 ? 'recorded day' : 'recorded days'}`} />
            <Fact value={data.summary.titles_visited} label={`${data.summary.titles_visited === 1 ? 'title visited' : 'titles visited'}`} />
            <Fact value={formatDuration(data.summary.estimated_session_seconds)} label="estimated" />
          </section>

          {data.titles.length > 0 && <section className="replay-section" aria-labelledby="replay-titles">
            <div className="replay-section-heading">
              <h2 id="replay-titles">Titles in your month</h2>
              <span>{data.titles.length} recorded</span>
            </div>
            <div className="replay-covers">
              {data.titles.map(title => (
                <Link
                  key={title.novel_id}
                  to={`/novel/${encodeURIComponent(title.novel_id)}`}
                  className="replay-cover"
                  aria-label={`Open ${title.title} details`}
                >
                  <span className="replay-cover-art">
                    <img
                      src={coverUrl(title.novel_id)}
                      alt=""
                      loading="lazy"
                      onError={event => { event.currentTarget.style.display = 'none'; }}
                    />
                    <span>{title.title}</span>
                  </span>
                  <strong>{title.title}</strong>
                  <small>{title.recorded_days} recorded {title.recorded_days === 1 ? 'day' : 'days'}</small>
                </Link>
              ))}
            </div>
          </section>}

          {(data.milestones.started.length > 0 || data.milestones.completed.length > 0) && (
            <section className="replay-section replay-milestones" aria-labelledby="replay-milestones">
              <div className="replay-section-heading">
                <h2 id="replay-milestones">Recorded milestones</h2>
                <span>Current saved dates</span>
              </div>
              <div className="replay-milestone-grid">
                {data.milestones.started.map(item => (
                  <p key={`started-${item.novel_id}`}><span>Started</span> {item.title} · {item.date}</p>
                ))}
                {data.milestones.completed.map(item => (
                  <p key={`completed-${item.novel_id}`}><span>Completed</span> {item.title} · {item.date}</p>
                ))}
              </div>
            </section>
          )}

          {data.days.length > 0 && <section className="replay-section" aria-labelledby="replay-days">
            <div className="replay-section-heading">
              <h2 id="replay-days">Day by day</h2>
              <span>Observed activity</span>
            </div>
            <div className="replay-days">
              {data.days.map(day => (
                <article key={day.date} className="panel replay-day">
                  <header>
                    <h3><time dateTime={day.date}>{dayLabel(day.date)}</time></h3>
                    {day.estimated_session_seconds > 0 && (
                      <span>{formatDuration(day.estimated_session_seconds)} estimated</span>
                    )}
                  </header>
                  {day.titles.length === 0 ? (
                    <p className="text-muted">Estimated session activity; no chapter position was recorded.</p>
                  ) : day.titles.map((visit, index) => (
                    <div className="replay-visit" key={`${visit.novel_id}-${visit.read_through}-${index}`}>
                      <Link to={`/novel/${encodeURIComponent(visit.novel_id)}`}>{visit.title}</Link>
                      <span>{observedRange(visit)}</span>
                      {visit.read_through > 1 && <small>Read-through {visit.read_through}</small>}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>}
        </>
      )}

      <aside className="replay-caveat">
        <strong>About this replay</strong>
        <p>
          Based on activity recorded by ReadSync. Chapter ranges are observed visits, not verified
          completions, and jumps do not imply intervening chapters were read. Estimated session time
          can include elapsed page time. Offline activity may appear on the date it was uploaded.
          Current started and completed dates can be edited and are not a complete event history.
        </p>
        {data?.coverage.first_recorded_at && (
          <p>
            This replay’s recorded chapter-position activity spans {new Date(data.coverage.first_recorded_at).toLocaleDateString()}
            {' '}to {new Date(data.coverage.last_recorded_at ?? data.coverage.first_recorded_at).toLocaleDateString()}.
          </p>
        )}
      </aside>
    </div>
  );
}
