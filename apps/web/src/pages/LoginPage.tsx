import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, name, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered">
      <form className="card auth-card" onSubmit={submit}>
        <h1 className="auth-title">
          <span className="brand-mark">▦</span> Product Costing
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {mode === 'login'
            ? 'Sign in to your account.'
            : 'Create the first (admin) account for your organisation.'}
        </p>

        {mode === 'register' && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
          />
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'First time? Create the admin account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
