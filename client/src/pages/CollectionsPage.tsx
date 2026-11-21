import { useState, type FormEvent } from 'react';
import { hasRole } from '../../../shared/auth';
import type { CollectionDetail, CollectionListResponse, CollectionSummary } from '../../../shared/types';
import { send, useApi } from '../api';
import { useAuth } from '../auth';
import { tintFor } from '../format';
import { Link, useRouter } from '../router';
import { RecipeCardView } from './HomePage';
import { NotFoundPage } from './NotFoundPage';

/** /collections */
export function CollectionsPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const list = useApi<CollectionListResponse>('/api/collections');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const r = await send<{ slug: string }>('/api/collections', 'POST', { name, description });
    if (r.ok) navigate(`/collections/${encodeURIComponent(r.data.slug)}`);
    else setError(r.error);
  };

  return (
    <main className="collections">
      <header>
        <p className="eyebrow">COLLECTIONS</p>
        <h1>Collections</h1>
        <p className="muted">Family lists of recipes: holidays, weeknight standbys, someone's favorites.</p>
      </header>

      {list.status === 'error' && <p className="notice notice-warn">{list.message}</p>}
      {list.status === 'ok' && list.data.collections.length === 0 && (
        <p className="notice">No collections yet.{user ? ' Start one below, or from any recipe page.' : ''}</p>
      )}

      <div className="collection-grid">
        {list.status === 'ok' && list.data.collections.map((c) => <CollectionCard key={c.slug} collection={c} />)}
      </div>

      {user && (
        <form className="collection-new" onSubmit={create}>
          <h2>Start a collection</h2>
          <div className="row">
            <label className="field">
              <span className="label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thanksgiving" maxLength={80} required />
            </label>
            <label className="field grow">
              <span className="label">Description (optional)</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="The ones we make every year" maxLength={500} />
            </label>
            <button type="submit" className="button button-primary" disabled={!name.trim()}>
              Create
            </button>
          </div>
          {error && <p className="field-error">{error}</p>}
        </form>
      )}
    </main>
  );
}

function CollectionCard({ collection: c }: { collection: CollectionSummary }) {
  return (
    <Link to={`/collections/${encodeURIComponent(c.slug)}`} className="collection-card">
      <div className={`collection-cover n${Math.min(c.photos.length, 4)}`} style={c.photos.length ? undefined : { backgroundColor: tintFor(c.slug) }}>
        {c.photos.slice(0, 4).map((p) => (
          <span key={p} style={{ backgroundImage: `url(${JSON.stringify(p)})` }} />
        ))}
      </div>
      <div className="collection-body">
        <h2>{c.name}</h2>
        <p className="mono small muted">
          {c.recipeCount} {c.recipeCount === 1 ? 'RECIPE' : 'RECIPES'}
          {c.createdBy ? ` · ${c.createdBy.name.toUpperCase()}` : ''}
        </p>
        {c.description && <p className="small">{c.description}</p>}
      </div>
    </Link>
  );
}

/** /collections/:slug */
export function CollectionPage({ slug }: { slug: string }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [version, setVersion] = useState(0);
  const state = useApi<CollectionDetail>(`/api/collections/${encodeURIComponent(slug)}${version ? `?v=${version}` : ''}`);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'not-found') return <NotFoundPage what="collection" />;
  if (state.status === 'error') return <main className="narrow"><p className="notice notice-warn">{state.message}</p></main>;
  if (!('data' in state) || !state.data) return <main className="narrow"><p className="muted">Loading…</p></main>;

  const c = state.data;
  const canManage = !!user && (hasRole(user.role, 'editor') || c.createdBy?.id === user.id);
  const reload = () => setVersion((v) => v + 1);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await send(`/api/collections/${encodeURIComponent(slug)}`, 'PATCH', { name, description });
    if (r.ok) {
      setEditing(false);
      setError(null);
      reload();
    } else setError(r.error);
  };
  const remove = async () => {
    if (!window.confirm(`Delete the "${c.name}" collection? The recipes themselves stay.`)) return;
    const r = await send(`/api/collections/${encodeURIComponent(slug)}`, 'DELETE');
    if (r.ok) navigate('/collections');
    else setError(r.error);
  };
  const takeOut = async (recipeSlug: string) => {
    await send(`/api/collections/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(recipeSlug)}`, 'DELETE');
    reload();
  };

  return (
    <main className="collections">
      <nav className="crumbs mono" aria-label="Breadcrumb">
        <Link to="/collections">COLLECTIONS</Link> / <span>{c.name.toUpperCase()}</span>
      </nav>
      {editing ? (
        <form className="collection-new" onSubmit={save}>
          <div className="row">
            <label className="field">
              <span className="label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </label>
            <label className="field grow">
              <span className="label">Description</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            </label>
            <button type="submit" className="button button-primary">
              Save
            </button>
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <header className="collection-head">
          <div>
            <h1>{c.name}</h1>
            {c.description && <p className="muted">{c.description}</p>}
            <p className="mono small muted">
              {c.recipeCount} {c.recipeCount === 1 ? 'RECIPE' : 'RECIPES'}
              {c.createdBy ? ` · STARTED BY ${c.createdBy.name.toUpperCase()}` : ''}
            </p>
          </div>
          {canManage && (
            <div className="row">
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  setName(c.name);
                  setDescription(c.description ?? '');
                  setEditing(true);
                }}
              >
                Rename
              </button>
              <button type="button" className="text-button" onClick={remove}>
                Delete collection
              </button>
            </div>
          )}
        </header>
      )}
      {error && <p className="field-error">{error}</p>}

      {c.recipes.length === 0 ? (
        <p className="notice">Nothing in here yet. Open a recipe and use “Add to a collection”.</p>
      ) : (
        <div className="card-grid">
          {c.recipes.map((r) => (
            <div key={r.slug} className="collection-item">
              <RecipeCardView recipe={r} />
              {user && (
                <button type="button" className="text-button small" onClick={() => takeOut(r.slug)}>
                  Take out of collection
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
