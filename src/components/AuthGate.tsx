'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { DEFAULT_TENANT_ID } from '@/lib/supabaseConfig';
import GlobalShell from './GlobalShell';

/**
 * AuthGate — the SaaS front door. Renders a login form when there's no
 * session, renders the full GlobalShell when authenticated. The signed-in
 * user's tenant is resolved from their profile (falling back to the dev
 * tenant until multi-tenant auth is fully wired).
 *
 * This is the single gate — the app is unreachable without signing in.
 */
export default function AuthGate() {
  const [session, setSession] = useState<ReturnType<typeof supabaseBrowser.auth.getSession> extends Promise<infer R> ? R extends { data: { session: infer S } } ? S : null : null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session as any);
      setLoading(false);
    });

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, s) => {
      setSession(s as any);
      setError(null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a0a', color: '#888' }}>
        <div>Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm onError={setError} error={error} />;
  }

  return <GlobalShell />;
}

function LoginForm({ onError, error }: { onError: (e: string | null) => void; error: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    onError(null);

    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) {
      onError(error.message);
      setSubmitting(false);
    }
    // on success, onAuthStateChange fires → AuthGate re-renders with session
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a0a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, background: '#141414', borderRadius: 12, padding: 32, border: '1px solid #222' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#e0e0e0', marginBottom: 4 }}>Unsaid</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>Sign in to your workspace</div>

        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, color: '#e0e0e0', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, color: '#e0e0e0', fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}
        />

        {error && (
          <div style={{ fontSize: 12, color: '#e5484d', marginBottom: 16, padding: '8px 12px', background: '#1a0e0e', borderRadius: 6, border: '1px solid #3a1a1a' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', padding: '11px', background: '#0a6400', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
