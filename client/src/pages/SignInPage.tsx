import { useState, type FormEvent } from 'react';
import { send } from '../api';
import { useAuth } from '../auth';
import { Link } from '../router';

export function SignInPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return (
      <main className="narrow auth">
        <h1>You're signed in</h1>
        <p className="muted">
          Signed in as <strong>{user.name}</strong> ({user.email}).
        </p>
        <Link to="/" className="button button-primary">
          Go to the recipes
        </Link>
      </main>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('sending');
    const result = await send('/api/auth/request', 'POST', { email });
    if (result.ok) setState('sent');
    else {
      setState('idle');
      setError(result.error);
    }
  };

  if (state === 'sent') {
    return (
      <main className="narrow auth">
        <p className="eyebrow">CHECK YOUR EMAIL</p>
        <h1>Look for a sign-in link</h1>
        <p>
          If <strong>{email}</strong> belongs to someone in the family, a link is on its way. It works once and expires in 15
          minutes.
        </p>
        {import.meta.env.DEV && (
          <p className="notice small">Running locally: the email isn't sent. The link is printed in the terminal running npm run dev.</p>
        )}
        <button type="button" className="text-button" onClick={() => setState('idle')}>
          Use a different email
        </button>
      </main>
    );
  }

  return (
    <main className="narrow auth">
      <p className="eyebrow">FAMILY SIGN-IN</p>
      <h1>Sign in to add recipes</h1>
      <p className="muted">
        Anyone can browse and cook. Signing in is for family who add and edit recipes. There's no password: we'll email you a
        link.
      </p>
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span className="label">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {error && (
          <p className="notice notice-warn" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
      <p className="small muted">Not invited yet? Ask Joel to add you.</p>
    </main>
  );
}
