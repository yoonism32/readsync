import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import App from '../App.js';

// Both App.tsx and Login.tsx import this same module, so one mock covers the
// guard and the sign-in form. Everything except auth/key storage stays real.
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  status: vi.fn(),
  logout: vi.fn(),
  recoverApiKey: vi.fn(),
  hasApiKey: vi.fn(),
  setApiKey: vi.fn(),
}));

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    hasApiKey: mocks.hasApiKey,
    setApiKey: mocks.setApiKey,
    auth: {
      login: mocks.login,
      status: mocks.status,
      logout: mocks.logout,
      recoverApiKey: mocks.recoverApiKey,
    },
  };
});

/**
 * Renders the whole app, not just <Login />: the redirect decision lives in
 * App's RequireAuth guard, so a form-only test cannot see this bug.
 */
function renderApp() {
  window.history.pushState({}, '', '/app/login');
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <App />
    </SWRConfig>,
  );
}

async function signIn() {
  const user = userEvent.setup();
  // Exact labels: the show/hide toggle is aria-labelled "Show password".
  await user.type(screen.getByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password'), 'correct-horse');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

/**
 * Asserts the *settled* signed-in state.
 *
 * Waiting on the URL alone is not enough: the bug pushes /mylist and replaces
 * it back to /login ~2 ms later, so a pathname check passes during the bounce.
 * The nav only renders inside Layout — i.e. once the guard has let us through.
 */
async function expectSignedIn() {
  await screen.findByRole('link', { name: /my list/i });
  expect(window.location.pathname).toBe('/app/mylist');
  expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
}

beforeEach(() => {
  mocks.login.mockResolvedValue({ success: true, api_key: 'test-key' });
  mocks.status.mockResolvedValue({ authenticated: true, username: 'admin' });
  mocks.logout.mockResolvedValue({ success: true });
  mocks.recoverApiKey.mockResolvedValue({ api_key: 'test-key' });
  mocks.hasApiKey.mockReturnValue(true);
  // Keep stray SWR fetches from unrelated widgets quiet.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign-in', () => {
  it('signs back in on the first attempt after signing out', async () => {
    const user = userEvent.setup();
    renderApp();

    // First sign-in, then sign out — this is what leaves a cached
    // { authenticated: false } behind, since the guard is still mounted and
    // logout's mutate() genuinely revalidates.
    await signIn();
    await expectSignedIn();

    mocks.status.mockResolvedValue({ authenticated: false });
    await user.click(screen.getByRole('button', { name: /log out/i }));
    await screen.findByRole('button', { name: /sign in/i });

    // The session is valid again from here on.
    mocks.status.mockResolvedValue({ authenticated: true, username: 'admin' });
    await signIn();

    await expectSignedIn();
    // One submission, not two. This is the whole bug.
    expect(mocks.login).toHaveBeenCalledTimes(2); // once before sign-out, once now
  });

  it('does not block the transition on a status refetch', async () => {
    // A status check that never settles. The login response already proved the
    // session is valid, so the user must get in regardless — the guard may
    // revalidate in the background, but it must not gate entry on it.
    mocks.status.mockReturnValue(new Promise(() => {}));

    renderApp();

    await signIn();

    await expectSignedIn();
  });

  it('reaches My List on a cold cache', async () => {
    renderApp();

    await signIn();

    await expectSignedIn();
  });

  it('stays on the login screen and reports a bad password', async () => {
    mocks.login.mockResolvedValue({ success: false, error: 'Invalid credentials' });

    renderApp();

    await signIn();

    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid credentials/i);
    expect(window.location.pathname).toBe('/app/login');
  });
});
