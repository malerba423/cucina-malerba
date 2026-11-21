import { useEffect } from 'react';
import { SITE_NAME } from '../../shared/site';
import { Link, RouterProvider, useRouter } from './router';
import { useTheme } from './theme';
import { HomePage } from './pages/HomePage';
import { RecipePage } from './pages/RecipePage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  );
}

function Shell() {
  const { pathname } = useRouter();
  const recipeMatch = /^\/recipes\/([^/]+)\/?$/.exec(pathname);

  let page;
  if (pathname === '/') page = <HomePage />;
  else if (recipeMatch) page = <RecipePage slug={decodeURIComponent(recipeMatch[1])} />;
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
  return (
    <header className="topbar">
      <Link to="/" className="logo">
        {SITE_NAME.toLowerCase()}
        <span className="logo-dot">.</span>
      </Link>
      <nav className="topnav" aria-label="Main">
        <Link to="/" className="topnav-link is-active">
          Browse
        </Link>
      </nav>
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
