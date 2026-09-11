import { useState } from 'react';
import { Spinner } from './Spinner.js';

/** A failed request is not an empty library. Keep recovery in the page. */
export function LoadError({ subject, onRetry }: { subject: string; onRetry: () => unknown }) {
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try { await onRetry(); } catch { /* The owning request retains its error state. */ }
    finally { setRetrying(false); }
  }
  return (
    <div className="page-feedback panel" role="alert">
      <p>Couldn’t load {subject}.</p>
      <button type="button" className="btn-ghost" disabled={retrying} onClick={() => { void retry(); }}>
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  );
}

export function PageLoading({ title }: { title: string }) {
  return (
    <div className="page-view">
      <h1 className="page-title">{title}</h1>
      <div className="page-loading"><Spinner size={28} /><span>Loading {title.toLowerCase()}…</span></div>
    </div>
  );
}
