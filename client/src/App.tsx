import { useEffect, useState } from 'react';
import { SITE_NAME } from '../../shared/site';
import { useTheme } from './theme';

type Health =
  | { state: 'checking' }
  | { state: 'ok'; dbMs: number }
  | { state: 'down' };

export function App() {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<Health>({ state: 'checking' });

  useEffect(() => {
    document.title = SITE_NAME;
    fetch('/api/health')
      .then(async (r) => {
        const body = await r.json();
        setHealth(r.ok && body.ok ? { state: 'ok', dbMs: body.dbMs } : { state: 'down' });
      })
      .catch(() => setHealth({ state: 'down' }));
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <div className="logo">
          {SITE_NAME.toLowerCase()}
          <span className="logo-dot">.</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="hero">
        <p className="eyebrow">MALERBA FAMILY RECIPES · COMING SOON</p>
        <h1>What are we cooking?</h1>
        <p className="lead">
          The kitchen is being set up. Soon this will hold recipes from family, from friends, and
          from everywhere else we've found them.
        </p>

        <div className="card" role="status">
          <span className="card-label">STATUS</span>
          {health.state === 'checking' && <span>Checking the kitchen…</span>}
          {health.state === 'ok' && (
            <span>
              Server and database are up <span className="muted">({health.dbMs} ms)</span>
            </span>
          )}
          {health.state === 'down' && <span className="warn">Server is up, database isn't reachable</span>}
        </div>
      </main>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
