import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ADDED_RANGES,
  SEARCH_FIELDS,
  SOURCE_LABELS,
  SOURCE_TYPES,
  type AddedRange,
  type BrowseResponse,
  type RecipeCard,
  type RecipeListResponse,
  type SearchField,
  type SourceType,
} from '../../../shared/types';
import { formatMinutes } from '../../../shared/units';
import { useApi, useDebounced } from '../api';
import { firstName, KIND_LABEL, possessive, shortDate, stars, tintFor } from '../format';
import { useAuth } from '../auth';
import { Link, useRouter } from '../router';

const FIELD_LABELS: Record<SearchField, string> = { any: 'Anything', name: 'Name', ingredient: 'Ingredient', source: 'Source' };
const ADDED_LABELS: Record<AddedRange, string> = { any: 'Any time', month: 'Past month', year: 'Past year', custom: 'Pick months…' };

// How the results are laid out: photo cards or compact rows with a thumbnail. Remembered on this device.
const LAYOUTS = ['gallery', 'list'] as const;
type Layout = (typeof LAYOUTS)[number];
const LAYOUT_LABELS: Record<Layout, string> = { gallery: 'Gallery', list: 'List' };
const LAYOUT_KEY = 'cucina.homeLayout';
function readLayout(): Layout {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    return LAYOUTS.includes(saved as Layout) ? (saved as Layout) : 'gallery';
  } catch {
    return 'gallery';
  }
}
const QUICK = [
  { key: 'under30', label: 'Under 30 min' },
  { key: 'never-made', label: 'Have not made' },
  { key: 'made', label: "Have made" },
] as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function HomePage() {
  const { user, ready } = useAuth();
  const [layout, setLayout] = useState<Layout>(readLayout);
  const chooseLayout = (l: Layout) => {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      // not remembered
    }
  };
  const { search, navigate } = useRouter();

  // Filters live in the URL, so "back" from a recipe returns to the same view
  // and a filtered list can be shared as a link.
  const by = oneOf<SearchField>(search.get('by'), SEARCH_FIELDS, 'any');
  // Signed in, the page opens on "Mine" (once there's something in it); otherwise on everything.
  const browse = useApi<BrowseResponse>(ready ? `/api/browse${user ? `?u=${user.id}` : ''}` : null); // refetch on sign-in/out for the Mine count
  const browseData = browse.status === 'ok' ? browse.data : undefined;
  // Mine vs Everything is remembered per person on this device: the page opens on whichever you picked last
  // (Everything the very first time, and always when signed out).
  const [view, setView] = useState<'mine' | 'all'>('all');
  useEffect(() => setView(user ? readView(user.id) : 'all'), [user]);
  const defaultSource: 'mine' | 'all' = user ? view : 'all';
  const source = oneOf<SourceType | 'all' | 'mine'>(search.get('source'), [...SOURCE_TYPES, 'all', 'mine'], defaultSource);
  const added = oneOf<AddedRange>(search.get('added'), ADDED_RANGES, 'any');
  const urlQuery = search.get('q') ?? '';
  const person = search.get('person') ?? '';
  const quick = new Set((search.get('quick') ?? '').split(',').filter(Boolean));
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';

  const [text, setText] = useState(urlQuery);
  // Search once typing pauses, not on every key.
  const debounced = useDebounced(text.trim(), 300);

  // Back/forward changes the URL under us: bring the search box in line with it.
  // Our own typing also lands in the URL a moment later; by then the box may hold
  // more letters, so leave it alone when the URL just caught up with what we sent.
  useEffect(() => {
    if (urlQuery !== debounced && urlQuery !== text.trim()) setText(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  // Drawers and family pills each start a fresh view: picking one clears the
  // search box and every other filter, so "Clara's" means all of Clara's.
  const startFresh = (choice: { source?: string; person?: string }) => {
    setText('');
    const next = new URLSearchParams();
    if (choice.person) {
      next.set('person', choice.person);
      if (defaultSource !== 'all') next.set('source', 'all'); // not "Clara's within Mine"
    } else if (choice.source === 'mine' || choice.source === 'all') {
      // Picking Mine or Everything also makes it the view the page opens on next time.
      if (user) {
        saveView(user.id, choice.source);
        setView(choice.source);
      } else if (choice.source !== 'all') next.set('source', choice.source);
    } else if (choice.source && choice.source !== defaultSource) {
      next.set('source', choice.source);
    }
    const qs = next.toString();
    navigate(qs ? `/?${qs}` : '/', { replace: true });
  };

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(changes)) {
      if (k === 'source') {
        // Only a choice that differs from the default goes in the URL ("Everything" does when Mine is the default).
        if (v == null || v === defaultSource) next.delete(k);
        else next.set(k, v);
      } else if (v == null || v === '' || v === 'all' || v === 'any') next.delete(k);
      else next.set(k, v);
    }
    next.delete('sort'); // old links: there's one order now (newest first)
    next.delete('tags'); // old links: tags are found by searching now
    if (next.get('added') !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    const qs = next.toString();
    navigate(qs ? `/?${qs}` : '/', { replace: true });
  };

  // Typing updates the URL after a short pause, not on every keystroke.
  useEffect(() => {
    if (debounced !== urlQuery) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const apiParams = new URLSearchParams(search);
  apiParams.delete('tags');
  if (!apiParams.has('source') && defaultSource === 'mine') apiParams.set('source', 'mine');
  // Wait until we know who's signed in (and their saved view) so the list doesn't flash the wrong set.
  const settled = ready && (!user || view === readView(user.id));
  const list = useApi<RecipeListResponse>(settled ? `/api/recipes?${apiParams.toString()}` : null);

  const toggleQuick = (key: string) => {
    const next = new Set(quick);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      // "Never made" and "I've made" can't both be on
      if (key === 'never-made') next.delete('made');
      if (key === 'made') next.delete('never-made');
    }
    update({ quick: [...next].join(',') });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: text.trim() });
  };

  const filtered = urlQuery || source !== defaultSource || person || added !== 'any' || quick.size > 0;
  const listData = 'data' in list ? list.data : undefined;

  return (
    <>
      <section className="hero">
        {user ? (
          <div className="hero-greeting">
            <h1>Welcome back, {firstName(user.name)}.</h1>
            <p className="hero-sub">What's cooking today?</p>
          </div>
        ) : (
          <h1>Welcome to the family cookbook</h1>
        )}
        <div className="hero-links">
          <Link to="/collections" className="fridge-link">
            <span className="mono small">COLLECTIONS</span> Holidays, favorites, standbys →
          </Link>
        </div>
        <form className="search" role="search" onSubmit={onSubmit}>
          <label className="search-field">
            <SearchIcon />
            <span className="visually-hidden">Search recipes</span>
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                by === 'ingredient' ? 'Ingredients, like "chicken, lemon"' : by === 'source' ? 'A person, site, @handle or book' : 'Search name, ingredient, person, website…'
              }
            />
          </label>
          <div className="segmented" role="group" aria-label="Search by">
            {SEARCH_FIELDS.map((f) => (
              <button key={f} type="button" aria-pressed={by === f} onClick={() => update({ by: f })}>
                {FIELD_LABELS[f]}
              </button>
            ))}
          </div>
        </form>
              {browseData && browseData.people.length > 0 && (
          <nav className="family-row" aria-label="Recipes by family member">
            <span className="mono small muted">FROM THE FAMILY</span>
            {browseData.people.map((p) => {
              const active = person === String(p.id);
              return (
                <button key={p.id} type="button" className="family-pill" aria-pressed={active} onClick={() => startFresh(active ? {} : { person: String(p.id) })}>
                  {possessive(p.name)} recipes <span className="chip-count">{p.count}</span>
                </button>
              );
            })}
          </nav>
        )}
      </section>

      <div className="browse">
        <aside className="filters" aria-label="Filters">
          <section>
            <h2 className="label">Drawers</h2>
            <div className="drawers">
              <button type="button" aria-pressed={source === 'all'} onClick={() => startFresh({ source: 'all' })}>
                <span>Everything</span>
                <span className="mono">{browseData?.total ?? ''}</span>
              </button>
              {user && (
                <button type="button" aria-pressed={source === 'mine'} onClick={() => startFresh({ source: 'mine' })}>
                  <span>Mine</span>
                  <span className="mono">{browseData?.mine ?? ''}</span>
                </button>
              )}
              {SOURCE_TYPES.filter((t) => t !== 'person' && t !== 'original').map((t) => {
                const count = browseData?.sources.find((s) => s.sourceType === t)?.count ?? 0;
                if (!count && t === 'other') return null;
                return (
                  <button key={t} type="button" aria-pressed={source === t} onClick={() => startFresh({ source: t })}>
                    <span>{SOURCE_LABELS[t]}</span>
                    <span className="mono">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="label">Quick filters</h2>
            <div className="chips">
              {QUICK.filter((f) => f.key !== 'made' || user).map((f) => (
                <button key={f.key} type="button" className="chip" aria-pressed={quick.has(f.key)} onClick={() => toggleQuick(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="label" htmlFor="added">
              Date added
            </label>
            <select id="added" className="select" value={added} onChange={(e) => update({ added: e.target.value })}>
              {ADDED_RANGES.map((r) => (
                <option key={r} value={r}>
                  {ADDED_LABELS[r]}
                </option>
              ))}
            </select>
            {added === 'custom' && (
              <div className="month-range">
                <label>
                  <span className="small muted">From</span>
                  <input type="month" className="select" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
                </label>
                <label>
                  <span className="small muted">Through</span>
                  <input type="month" className="select" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
                </label>
              </div>
            )}
          </section>
        </aside>

        <main className="results" aria-busy={list.status === 'loading'}>
          <div className="results-head">
            <h2>{filtered ? 'Matching recipes' : source === 'mine' ? 'Your recipes' : 'Recently added'}</h2>
            <div className="results-tools">
              <div className="toggle layout-toggle" role="group" aria-label="Show recipes as">
                {LAYOUTS.map((l) => (
                  <button key={l} type="button" aria-pressed={layout === l} onClick={() => chooseLayout(l)} title={LAYOUT_LABELS[l]}>
                    <LayoutIcon layout={l} />
                    <span className="layout-label">{LAYOUT_LABELS[l]}</span>
                  </button>
                ))}
              </div>
              <span className="mono muted" aria-live="polite">
                {listData
                  ? `${listData.fullCount} ${listData.fullCount === 1 ? 'RECIPE' : 'RECIPES'}${
                      listData.total > listData.fullCount ? ` + ${listData.total - listData.fullCount} PARTIAL` : ''
                    }`
                  : ''}
              </span>
            </div>
          </div>

          {list.status === 'error' && <p className="notice notice-warn">Couldn't load recipes: {list.message}</p>}

          {listData && listData.recipes.length === 0 && (
            <div className="notice">
              {filtered ? (
                <>
                  Nothing matches those filters.{' '}
                  <button type="button" className="text-button" onClick={() => { setText(''); navigate('/', { replace: true }); }}>
                    Clear filters
                  </button>
                </>
              ) : (
                'The cookbook is empty so far. Recipes will show up here as the family adds them.'
              )}
            </div>
          )}

          {listData && listData.fullCount === 0 && listData.recipes.length > 0 && (
            <p className="notice">No recipe has all of those words. Here are the closest.</p>
          )}
          {listData && listData.fullCount > 0 && <RecipeResults recipes={listData.recipes.slice(0, listData.fullCount)} layout={layout} />}
          {listData && listData.recipes.length > listData.fullCount && (
            <>
              {listData.fullCount > 0 && (
                <h3 className="partial-head">
                  Partial matches <span className="small muted">missing a word or two</span>
                </h3>
              )}
              <RecipeResults recipes={listData.recipes.slice(listData.fullCount)} layout={layout} />
            </>
          )}
        </main>
      </div>
    </>
  );
}

export function RecipeCardView({ recipe, children }: { recipe: RecipeCard; children?: ReactNode }) {
  const made = recipe.madeCount ? `MADE ${recipe.madeCount}×` : 'NOT MADE YET';
  // Family recipes lead with whose they are: "Mom’s".
  const family = !!recipe.credit;
  return (
    <article className="card">
      <Link to={`/recipes/${encodeURIComponent(recipe.slug)}`} className="card-link">
        <div
          className="card-photo"
          style={recipe.photoUrl ? { backgroundImage: `url(${JSON.stringify(recipe.photoUrl)})` } : { backgroundColor: tintFor(recipe.slug) }}
        >
          <span className="badge mono">{KIND_LABEL[recipe.sourceType]}</span>
          {recipe.avgRating != null && <span className="badge">{stars(recipe.avgRating)}</span>}
        </div>
        <div className="card-body ruled">
          {family && <p className="card-family">{possessive(recipe.credit!)}</p>}
          <h3>{recipe.title}</h3>
          {recipe.source && !family && (
            <p>
              from <strong className="accent">{recipe.source}</strong>
            </p>
          )}
          <p className="mono muted small">
            ADDED {shortDate(recipe.createdAt)} · {made}
            {recipe.totalMinutes ? ` · ${formatMinutes(recipe.totalMinutes).toUpperCase()}` : ''}
          </p>
          {children}
        </div>
      </Link>
    </article>
  );
}

/** Whose it is ("Mom’s") or where it's from, for the list layout. */
function creditLine(r: RecipeCard): ReactNode {
  if (r.credit) return <span className="accent">{possessive(r.credit)}</span>;
  return r.source ? <span className="muted">from {r.source}</span> : null;
}

const missedNote = (r: RecipeCard) => (r.missed ? <span className="small missed">No match for: {r.missed.join(', ')}</span> : null);

function RecipeResults({ recipes, layout }: { recipes: RecipeCard[]; layout: Layout }) {
  if (layout === 'list') {
    return (
      <ul className="recipe-list">
        {recipes.map((r) => (
          <li key={r.slug}>
            <Link to={`/recipes/${encodeURIComponent(r.slug)}`} className="recipe-row">
              <span
                className="row-thumb"
                aria-hidden="true"
                style={r.photoUrl ? { backgroundImage: `url(${JSON.stringify(r.photoUrl)})` } : { backgroundColor: tintFor(r.slug) }}
              />
              <span className="row-main">
                <span className="row-title">{r.title}</span>
                <span className="row-sub small">
                  {creditLine(r)}
                  {missedNote(r)}
                </span>
              </span>
              <span className="row-meta mono small muted">
                {r.avgRating != null && <span>{stars(r.avgRating)}</span>}
                {r.totalMinutes ? <span>{formatMinutes(r.totalMinutes).toUpperCase()}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="card-grid">
      {recipes.map((r) => (
        <RecipeCardView key={r.slug} recipe={r}>
          {r.missed && <p className="small missed">No match for: {r.missed.join(', ')}</p>}
        </RecipeCardView>
      ))}
    </div>
  );
}

function LayoutIcon({ layout }: { layout: Layout }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;
  if (layout === 'gallery')
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </svg>
    );
  return (
    <svg {...common} strokeLinecap="round">
      <rect x="3" y="4" width="5" height="5" rx="1" />
      <rect x="3" y="15" width="5" height="5" rx="1" />
      <path d="M11 6.5h10M11 17.5h10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

const VIEW_KEY = (userId: number) => `cucina.homeView.${userId}`;

function readView(userId: number): 'mine' | 'all' {
  try {
    return localStorage.getItem(VIEW_KEY(userId)) === 'mine' ? 'mine' : 'all';
  } catch {
    return 'all';
  }
}

function saveView(userId: number, view: 'mine' | 'all') {
  try {
    localStorage.setItem(VIEW_KEY(userId), view);
  } catch {
    // not remembered: the page just opens on Everything
  }
}
