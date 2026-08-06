import useSWR from 'swr';
import toast from 'react-hot-toast';
import { swrFetcher, admin as adminApi } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { formatTimestamp } from '../api/client.js';
import type { BotStatus } from '../types/index.js';

export function Admin() {
  const { data: status, isLoading, mutate } = useSWR<BotStatus>(
    '/admin/bot/status',
    swrFetcher,
    { refreshInterval: 5000 }
  );

  async function handleTrigger() {
    try {
      await adminApi.triggerBot();
      toast.success('Bot triggered');
      await mutate();
    } catch {
      toast.error('Failed to trigger bot');
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Admin</h1>

      {/* Bot status */}
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Chapter Update Bot</h2>
          <button
            onClick={() => { void handleTrigger(); }}
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-on-accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '7px 14px',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Trigger Run
          </button>
        </div>

        {isLoading ? (
          <Spinner />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Status',   value: status?.running ? 'Running…' : 'Idle' },
              { label: 'Last Run', value: status?.lastRun ? formatTimestamp(status.lastRun) : 'Never' },
              { label: 'Updated',  value: status?.novelsUpdated ?? 0 },
              { label: 'Checked',  value: status?.novelsChecked ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
                <div className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 4 }}>{label}</div>
                <div className="tabular" style={{ fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {status?.errors && status.errors.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="text-muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 6 }}>Recent errors:</p>
            {status.errors.slice(0, 5).map((err, i) => (
              <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', padding: '4px 8px', background: 'var(--color-danger-dim)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>
                {err}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
