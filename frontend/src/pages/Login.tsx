import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { auth, setApiKey } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { EyeIcon, EyeOffIcon } from '../components/Icon.js';

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '9px 12px',
  color: 'var(--color-text)',
  fontSize: 'var(--text-base)',
  outline: 'none',
  width: '100%',
};

export function Login() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await auth.login(username, password);
      if (res.success) {
        // The server hands back the account's API key on login now, so
        // the app is never left in a signed-in-but-no-data state — it
        // used to require pasting this manually, which was easy to get
        // wrong or skip.
        if (res.api_key) setApiKey(res.api_key);
        // Seed the cache from this response rather than refetching: nothing is
        // subscribed to 'auth-status' while we're on the login route, so a bare
        // mutate() has no fetcher to run and would resolve without asking.
        await mutate('auth-status', { authenticated: true, username }, { revalidate: false });
        navigate('/mylist');
      } else {
        setError(res.error ?? 'Invalid credentials');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in login-shell">
      {/* Wordmark — left-aligned, and the larger of the two columns. */}
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.75rem, 7vw, 4.5rem)',
            lineHeight: 1.05,
            fontWeight: 700,
            color: 'var(--color-accent)',
            letterSpacing: '-0.03em',
            marginBottom: 12,
            overflowWrap: 'anywhere',
          }}
        >
          ReadSync
        </h1>
        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-lg)',
            maxWidth: '24ch',
          }}
        >
          Cross-device reading progress
        </p>
      </div>

      {/* Card */}
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        className="panel"
        style={{ borderRadius: 'var(--radius-xl)', padding: 28, minWidth: 0 }}
        aria-label="Sign in form"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Username */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Username
            </span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              spellCheck={false}
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              className="input"
              style={inputStyle}
            />
          </label>

          {/* Password */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Password
            </span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="icon-btn"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  height: '100%',
                  width: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </label>

          {/* Error */}
          {error && (
            <div
              id="login-error"
              role="alert"
              aria-live="polite"
              style={{
                background: 'var(--color-danger-dim)',
                border: '1px solid var(--color-danger-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                color: 'var(--color-danger)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn-accent"
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              fontSize: 'var(--text-base)',
              whiteSpace: 'nowrap',
            }}
          >
            {loading && <Spinner size={16} />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
