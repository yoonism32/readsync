export function Admin() {
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
    </div>
  );
}
