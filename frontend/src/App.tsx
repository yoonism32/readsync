import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useSWR from 'swr';
import { auth } from './api/client.js';
import { Layout } from './components/Layout.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Login } from './pages/Login.js';
import { Spinner } from './components/Spinner.js';
import type { AuthStatus } from './types/index.js';
import type { ReactNode } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard.js').then(m => ({ default: m.Dashboard })));
const MyList    = lazy(() => import('./pages/MyList.js').then(m => ({ default: m.MyList })));
const NovelPage = lazy(() => import('./pages/Novel.js').then(m => ({ default: m.NovelPage })));
const Explorer  = lazy(() => import('./pages/Explorer.js').then(m => ({ default: m.Explorer })));
const Settings  = lazy(() => import('./pages/Settings.js').then(m => ({ default: m.Settings })));
const Admin     = lazy(() => import('./pages/Admin.js').then(m => ({ default: m.Admin })));
const Manage    = lazy(() => import('./pages/Manage.js').then(m => ({ default: m.Manage })));
const History   = lazy(() => import('./pages/History.js').then(m => ({ default: m.History })));
const Stats     = lazy(() => import('./pages/Stats.js').then(m => ({ default: m.Stats })));

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <Spinner size={28} />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  // Session check lives at /api/auth/status (cookie auth, no v1 prefix) —
  // routing it through the v1 request helper 404s and locks out login.
  const { data, error } = useSWR<AuthStatus>('auth-status', () => auth.status(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  // Wait only while we genuinely have no answer. Deliberately not keyed on
  // isLoading: that stays true during a background revalidation even when a
  // known-good status is already cached, which would strand a signed-in user
  // on this spinner. Once data exists, trust it and revalidate underneath.
  if (!data && !error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename="/app">
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-raised)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            backdropFilter: 'blur(12px)',
            fontSize: 'var(--text-sm)',
          },
          success: {
            iconTheme: { primary: 'var(--color-accent)', secondary: 'var(--color-on-accent)' },
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                {/* Inside Layout so the nav survives a page crash, and outside
                    Suspense because a rejected lazy() import throws past it. */}
                <ErrorBoundary>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="mylist" element={<MyList />} />
                    <Route path="novel/:novelId" element={<NovelPage />} />
                    <Route path="explorer" element={<Explorer />} />
                    <Route path="history" element={<History />} />
                    <Route path="stats" element={<Stats />} />
                    <Route path="manage" element={<Manage />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="admin" element={<Admin />} />
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
