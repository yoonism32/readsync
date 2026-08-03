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
  transition: 'border-color 0.15s',
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
        await mutate('auth-status');
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
    <div
      className="animate-fade-in"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-4xl)',
              fontWeight: 700,
              color: 'var(--color-gold)',
              letterSpacing: '-0.03em',
              marginBottom: 8,
            }}
          >
            ReadSync
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            Cross-device reading progress
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          className="glass"
          style={{ borderRadius: 'var(--radius-xl)', padding: 28 }}
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
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--color-gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
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
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-gold)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                    color: 'var(--color-text-faint)',
                    transition: 'color 0.15s',
                    touchAction: 'manipulation',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-faint)')}
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
                  border: '1px solid rgba(248,113,113,0.3)',
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
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'var(--color-gold)',
                color: '#080c12',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '10px 16px',
                fontWeight: 600,
                fontSize: 'var(--text-base)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 0.15s, transform 0.1s, background 0.15s',
                touchAction: 'manipulation',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--color-gold-bright)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-gold)'; }}
              onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {loading && <Spinner size={16} />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
