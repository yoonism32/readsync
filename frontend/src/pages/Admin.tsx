export function Admin() {
  return (
    <div className="page-view animate-fade-in admin-page">
      <h1 className="page-title">Admin</h1>

      <section className="panel admin-note bot-console" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)', marginBottom: 'var(--space-lg)' }}>
        <div className="bot-state"><span aria-hidden="true" />Local only</div>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 8 }}>
          Chapter Update Bot
        </h2>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          The chapter-update bot does not run on the live server. For a one-off
          refresh, run <code>npm run bot</code> locally.
        </p>
        <details className="chart-values">
          <summary>Local setup details</summary>
          <p className="text-muted">The bot lives in <code>bot/src/</code>. Setup instructions are in <code>docs/ARCHITECTURE.md</code>.</p>
        </details>
      </section>
    </div>
  );
}
