import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A thrown render is the difference between one broken panel and a black page.
 *
 * Every page is `lazy()`-loaded, and a failed dynamic import rejects somewhere
 * Suspense cannot catch — so it reached the root and unmounted the whole app.
 * That is the intermittent blank screen: a tab still holding the previous
 * index.html asks for chunk hashes that a redeploy has already replaced, gets
 * a 404, and dies. Reloading "fixes" it only because it fetches a fresh
 * index.html with the new hashes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Left in deliberately: without it a production-only crash leaves no trace.
    console.error('Render error caught by boundary', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A stale-chunk failure is not a bug the reader can act on, and it is
    // always cured by reloading — so say that rather than showing a stack.
    const isStaleChunk =
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        error.message,
      );

    return (
      <div
        className="panel"
        role="alert"
        style={{
          borderRadius: 'var(--radius-xl)',
          padding: '48px 24px',
          textAlign: 'center',
          maxWidth: 520,
          margin: '48px auto',
        }}
      >
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 8 }}>
          {isStaleChunk ? 'ReadSync has been updated' : 'That page failed to load'}
        </h2>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 20 }}>
          {isStaleChunk
            ? 'This tab is running an older version. Reload to pick up the new one.'
            : 'Something broke while rendering. Reloading usually clears it.'}
        </p>
        <button type="button" className="btn-accent" onClick={() => window.location.reload()}>
          Reload
        </button>
        {!isStaleChunk && (
          <pre
            className="text-faint"
            style={{
              marginTop: 20,
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {error.message}
          </pre>
        )}
      </div>
    );
  }
}
