import { useState } from 'react';
import type { MeResponse } from '../../../shared/auth';
import { send } from '../api';
import { useAuth } from '../auth';
import { Link, useRouter } from '../router';

// The emailed link opens this page with the token in the URL fragment (#token=…),
// which browsers never send to servers or put in logs. Signing in needs a click,
// because some email providers open links automatically to scan them, and that
// would otherwise use up the one-time link.
function readToken(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
}

export function VerifyPage() {
  const { setUser } = useAuth();
  const { navigate } = useRouter();
  const [token] = useState(readToken);
  const [state, setState] = useState<'ready' | 'working' | 'failed'>(token ? 'ready' : 'failed');
  const [error, setError] = useState(token ? '' : 'This sign-in link is incomplete. Copy the whole link from the email, or ask for a new one.');

  const finish = async () => {
    setState('working');
    const result = await send<MeResponse>('/api/auth/verify', 'POST', { token });
    if (result.ok) {
      window.history.replaceState(null, '', '/auth/verify'); // drop the token from the address bar
      setUser(result.data.user);
      navigate('/');
    } else {
      setState('failed');
      setError(result.error);
    }
  };

  if (state === 'failed') {
    return (
      <main className="narrow auth">
        <h1>That link didn't work</h1>
        <p className="notice notice-warn">{error}</p>
        <Link to="/signin" className="button button-primary">
          Get a new link
        </Link>
      </main>
    );
  }

  return (
    <main className="narrow auth">
      <p className="eyebrow">FAMILY SIGN-IN</p>
      <h1>Almost there</h1>
      <p className="muted">Finish signing in on this device. You'll stay signed in for 60 days.</p>
      <button type="button" className="button button-primary" onClick={finish} disabled={state === 'working'}>
        {state === 'working' ? 'Signing in…' : 'Finish signing in'}
      </button>
    </main>
  );
}
