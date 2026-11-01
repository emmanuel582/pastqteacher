import { useState } from 'react';
import { Brand } from '../components';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { request } from '../data';
import { auth } from '../api';
import { Button, ErrorBox } from '../components';
export default function Auth({ onDemo }) {
  const [mode, setMode] = useState('login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!auth) {
      setError('Add the Supabase URL and publishable key to teacher/.env to connect your account.');
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === 'signup'
          ? await auth.signUp({
              email,
              password,
              options: { data: { full_name: name }, emailRedirectTo: location.origin },
            })
          : mode === 'reset'
            ? await auth.resetPasswordForEmail(email, {
                redirectTo: location.origin + '/?recovery=1',
              })
            : new URLSearchParams(location.search).get('recovery')
              ? await auth.updateUser({ password })
              : await auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === 'reset' || (mode === 'signup' && !result.data.session)) setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <Brand />
      <div className="auth-layout">
        <section className="auth-intro">
          <span className="eyebrow">PASTQ TEACHER WORKSPACE</span>
          <h1>
            Create exams.
            <br />
            Track progress.
          </h1>
          <p>Upload question papers, run exam sessions, and review student results.</p>
        </section>
        <section className="auth-card">
          <span className="eyebrow">PASTQ FOR TEACHERS</span>
          <h2>
            {sent
              ? 'Check your inbox.'
              : mode === 'signup'
                ? 'Create a teacher account'
                : mode === 'reset'
                  ? 'Reset your password'
                  : 'Sign in to PastQ Teacher'}
          </h2>
          <p>
            {sent
              ? 'Follow the link in your email to continue.'
              : 'Use your PastQ account, or create a new one.'}
          </p>
          {!sent && (
            <form className="form-stack" onSubmit={submit}>
              {mode === 'signup' && (
                <label>
                  Your name
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {mode !== 'reset' && (
                <label>
                  Password
                  <input
                    required
                    type="password"
                    minLength={mode === 'signup' ? 8 : undefined}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              <ErrorBox error={error} />
              <Button variant="primary" disabled={busy}>
                {busy
                  ? 'One moment…'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'reset'
                      ? 'Send reset link'
                      : 'Sign in'}
                <ArrowRight size={17} />
              </Button>
            </form>
          )}
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === 'signup' ? 'login' : 'signup');
                setSent(false);
                setError('');
              }}
            >
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'New here? Create an account'}
            </button>
            <button
              onClick={() => {
                setMode('reset');
                setSent(false);
                setError('');
              }}
            >
              Forgot password?
            </button>
          </div>
          <div className="auth-divider">
            <span />
            or take a look around
            <span />
          </div>
          <Button variant="outline" onClick={onDemo}>
            Explore a demo workspace <ArrowUpRight size={17} />
          </Button>
          <small className="fine-print">A separate space for teachers. The PastQ you know.</small>
        </section>
      </div>
    </div>
  );
}
export function WorkspaceSetup({ user, onSaved }) {
  const [name, setName] = useState(user?.name || ''),
    [organization, setOrganization] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <Brand />
      <div className="setup-card">
        <span className="eyebrow">WORKSPACE SETUP</span>
        <h1>Create your workspace</h1>
        <p>Create your teacher workspace with your existing PastQ account.</p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await request('/teacher/profile', { method: 'PUT', body: { name, organization } });
              onSaved();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            School or organization <small>Optional</small>
            <input value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </label>
          <ErrorBox error={error} />
          <Button variant="primary" disabled={busy}>
            Create my workspace <ArrowRight size={17} />
          </Button>
        </form>
      </div>
    </div>
  );
}
export function Recovery() {
  const [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <Brand />
      <div className="setup-card">
        <h1>Your new password.</h1>
        <p>Choose a fresh password for your PastQ account.</p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { error } = await auth.updateUser({ password });
              if (error) throw error;
              await auth.signOut();
              location.replace('/');
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorBox error={error} />
          <Button variant="primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
            <ArrowRight size={17} />
          </Button>
        </form>
      </div>
    </div>
  );
}
