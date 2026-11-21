import { useEffect, useRef, useState } from 'react';
import { SITE_NAME } from '../../shared/site';
import { ROLE_LABELS } from '../../shared/auth';
import { AuthProvider, useAuth } from './auth';
import { initials } from './format';
import { Link, RouterProvider, useRouter } from './router';
import { useTheme } from './theme';
import { HomePage } from './pages/HomePage';
import { RecipePage } from './pages/RecipePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SignInPage } from './pages/SignInPage';
import { VerifyPage } from './pages/VerifyPage';
import { PeoplePage } from './pages/PeoplePage';
import { EditRecipePage } from './pages/EditRecipePage';
import { ImportPage } from './pages/ImportPage';

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </RouterProvider>
  );
}

function Shell() {
  const { pathname } = useRouter();
  const editMatch = /^\/recipes\/([^/]+)\/edit\/?$/.exec(pathname);
  const recipeMatch = pathname === '/recipes/new' ? null : /^\/recipes\/([^/]+)\/?$/.exec(pathname);

  let page;
  if (pathname === '/') page = <HomePage />;
  else if (pathname === '/recipes/new') page = <EditRecipePage />;
  else if (pathname === '/import' || pathname === '/import/') page = <ImportPage />;
  else if (editMatch) page = <EditRecipePage slug={decodeURIComponent(editMatch[1])} />;
  else if (recipeMatch) page = <RecipePage slug={decodeURIComponent(recipeMatch[1])} />;
  else if (pathname === '/signin') page = <SignInPage />;
  else if (pathname === '/auth/verify') page = <VerifyPage />;
  else if (pathname === '/people') page = <PeoplePage />;
  else page = <NotFoundPage />;

  const isRecipe = recipeMatch != null;
  useEffect(() => {
    if (!isRecipe) document.title = SITE_NAME; // the recipe page sets its own title
  }, [isRecipe, pathname]);

  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <div id="main">{page}</div>
    </div>
  );
}

function Header() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { pathname } = useRouter();
  const importing = pathname.startsWith('/import');
  return (
    <header className="topbar">
      <Link to="/" className="logo">
        {SITE_NAME.toLowerCase()}
        <span className="logo-dot">.</span>
      </Link>
      <nav className="topnav" aria-label="Main">
        <Link to="/" className={`topnav-link topnav-browse${importing ? '' : ' is-active'}`}>
          Browse
        </Link>
        {user && (
          <Link to="/import" className={`topnav-link${importing ? ' is-active' : ''}`}>
            Import
          </Link>
        )}
      </nav>
      <AccountArea />
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
  );
}

function AccountArea() {
  const { user, ready, signOut } = useAuth();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!ready) return null;
  if (!user) {
    return (
      <Link to="/signin" className="signin-link mono">
        FAMILY SIGN-IN
      </Link>
    );
  }

  return (
    <>
    <Link to="/recipes/new" className="button button-primary add-button" aria-label="Add recipe">
      <span aria-hidden="true">+</span>
      <span className="add-label"> Add recipe</span>
    </Link>
    <div className="account" ref={ref}>
      <button type="button" className="account-button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <span className="avatar avatar-sm" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="account-name">{user.name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="menu-meta small muted">
            {user.email}
            <br />
            {ROLE_LABELS[user.role]}
          </p>
          {user.role === 'owner' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/people');
              }}
            >
              Who can add recipes
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/');
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
    </>
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
