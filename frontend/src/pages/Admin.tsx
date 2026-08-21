import { useState } from 'react';
import { admin, type NovelArrowProbeResponse } from '../api/client.js';

const DEFAULT_PROBE_URL =
  'https://novelarrow.com/novel/unparalleled-after-ten-consecutive-draws';

export function Admin() {
  const [urlsText, setUrlsText] = useState(DEFAULT_PROBE_URL);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<NovelArrowProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runProbe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const urls = urlsText
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);

    setIsRunning(true);
    setResult(null);
    setError(null);
    try {
      setResult(await admin.probeNovelArrow(urls));
    } catch (probeError) {
      setError(
        probeError instanceof Error ? probeError.message : 'Probe failed',
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Admin</h1>

      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 8 }}>
          Chapter Update Bot
        </h2>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          Automated chapter-update scraping is intentionally disabled in production.
          The bot (<code>bot/src/</code>) exists as manual, local-only tooling — run it
          yourself with <code>npm run bot</code> if you need a one-off refresh. See{' '}
          <code>docs/ARCHITECTURE.md</code> for details.
        </p>
      </section>

      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 8 }}>
          NovelArrow Render Probe
        </h2>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: 18 }}>
          Sends read-only requests from this deployed ReadSync server, matching Refresh All&apos;s
          batch size of three. Add up to six exact NovelArrow novel URLs, one per line.
        </p>

        <form onSubmit={(event) => { void runProbe(event); }}>
          <label htmlFor="probe-urls" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 7 }}>
            Novel URLs
          </label>
          <textarea
            id="probe-urls"
            value={urlsText}
            onChange={(event) => setUrlsText(event.target.value)}
            rows={6}
            spellCheck={false}
            disabled={isRunning}
            className="input"
            style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={isRunning || urlsText.trim().length === 0}
              style={{
                border: 0,
                borderRadius: 'var(--radius-md)',
                padding: '9px 16px',
                background: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
                fontWeight: 600,
                cursor: isRunning ? 'wait' : 'pointer',
                opacity: isRunning ? 0.65 : 1,
              }}
            >
              {isRunning ? 'Probing from Render…' : 'Run Render Probe'}
            </button>
            <span className="text-muted" role="status" aria-live="polite" style={{ fontSize: 'var(--text-sm)' }}>
              {isRunning ? 'This can take up to 45 seconds.' : result?.summary ?? ''}
            </span>
          </div>
        </form>

        {error ? (
          <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginTop: 14 }}>
            {error}
          </p>
        ) : null}

        {result ? (
          <div style={{ overflowX: 'auto', marginTop: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '9px 8px', borderBottom: '1px solid var(--color-border)' }}>Novel</th>
                  <th style={{ padding: '9px 8px', borderBottom: '1px solid var(--color-border)' }}>HTTP</th>
                  <th style={{ padding: '9px 8px', borderBottom: '1px solid var(--color-border)' }}>Time</th>
                  <th style={{ padding: '9px 8px', borderBottom: '1px solid var(--color-border)' }}>Latest metadata</th>
                  <th style={{ padding: '9px 8px', borderBottom: '1px solid var(--color-border)' }}>Cloudflare</th>
                  <th style={{ padding: '9px 8px', borderBottom: '1px solid var(--color-border)' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((item) => (
                  <tr key={item.url}>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--color-border)', maxWidth: 220, overflowWrap: 'anywhere' }}>{item.slug}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--color-border)' }}>{item.status || '—'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{item.elapsed_ms}ms</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--color-border)', minWidth: 190 }}>{item.latest_chapter ?? 'Missing'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                      {item.challenged ? 'Challenge' : item.cf_ray ?? 'No CF-Ray'}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--color-border)', color: item.ok ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                      {item.ok ? 'Usable' : item.error ?? 'Failed'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
