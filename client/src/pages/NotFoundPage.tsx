import { Link } from '../router';

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <main className="narrow empty">
      <p className="eyebrow">404</p>
      <h1>That {what} isn't in the box.</h1>
      <p className="muted">It may have been renamed or removed.</p>
      <Link to="/" className="button button-primary">
        Back to all recipes
      </Link>
    </main>
  );
}
