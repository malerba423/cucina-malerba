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
import { initials, KIND_LABEL, shortDate, stars, tintFor } from '../format';
import { Link, useRouter } from '../router';

const FIELD_LABELS: Record<SearchField, string> = { any: 'Anything', name: 'Name', ingredient: 'Ingredient', source: 'Source' };
const ADDED_LABELS: Record<AddedRange, string> = { any: 'Any time', month: 'Past month', year: 'Past year', custom: 'Pick months…' };
const TAGS_SHOWN = 12;
const QUICK = [
  { key: 'under30', label: 'Under 30 min' },
  { key: 'never-made', label: 'Never made' },
  { key: 'made-often', label: 'Made 3+ times' },
  { key: 'rated4', label: '★ 4+' },
] as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function HomePage() {
  const { search, navigate } = useRouter();

  // Filters live in the URL, so "back" from a recipe returns to the same view
  // and a filtered list can be shared as a link.
  const by = oneOf<SearchField>(search.get('by'), SEARCH_FIELDS, 'any');
  const source = oneOf<SourceType | 'all'>(search.get('source'), [...SOURCE_TYPES, 'all'], 'all');
  const added = oneOf<AddedRange>(search.get('added'), ADDED_RANGES, 'any');
  const urlQuery = search.get('q') ?? '';
  const person = search.get('person') ?? '';
  const quick = new Set((search.get('quick') ?? '').split(',').filter(Boolean));
  const tags = (search.get('tags') ?? '').split(',').filter(Boolean);
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  const [allTags, setAllTags] = useState(false);

  const [text, setText] = useState(urlQuery);
  const debounced = useDebounced(text.trim(), 250);

  // Back/forward changes the URL under us: bring the box in line with it.
  useEffect(() => {
    if (urlQuery !== text.trim()) setText(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '' || v === 'all' || v === 'any') next.delete(k);
      else next.set(k, v);
    }
    next.delete('sort'); // old links: there's one order now (newest first)
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
  const list = useApi<RecipeListResponse>(`/api/recipes?${apiParams.toString()}`);
  const browse = useApi<BrowseResponse>('/api/browse');

  const toggleQuick = (key: string) => {
    const next = new Set(quick);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update({ quick: [...next].join(',') });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: text.trim() });
  };

  const toggleTag = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    update({ tags: next.join(',') });
  };

  const filtered = urlQuery || source !== 'all' || person || added !== 'any' || quick.size > 0 || tags.length > 0;
  const browseData = browse.status === 'ok' ? browse.data : undefined;
  const listData = 'data' in list ? list.data : undefined;

  return (
    <>
      <section className="hero">
        <h1>What are we cooking?</h1>
        <div className="hero-links">
          <Link to="/fridge" className="fridge-link">
            <span className="mono small">FRIDGE MODE</span> What can I make with what I have? →
          </Link>
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
      </section>

      <div className="browse">
        <aside className="filters" aria-label="Filters">
          <section>
            <h2 className="label">Drawers</h2>
            <div className="drawers">
              <button type="button" aria-pressed={source === 'all'} onClick={() => update({ source: 'all' })}>
                <span>Everything</span>
                <span className="mono">{browseData?.total ?? ''}</span>
              </button>
              {SOURCE_TYPES.map((t) => {
                const count = browseData?.sources.find((s) => s.sourceType === t)?.count ?? 0;
                if (!count && t === 'other') return null;
                return (
                  <button key={t} type="button" aria-pressed={source === t} onClick={() => update({ source: t })}>
                    <span>{SOURCE_LABELS[t]}</span>
                    <span className="mono">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {browseData && browseData.people.length > 0 && (
            <section>
              <h2 className="label">Who it came from</h2>
              <div className="people">
                {browseData.people.map((p) => {
                  const active = person === String(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="person"
                      aria-pressed={active}
                      onClick={() => update({ person: active ? null : String(p.id) })}
                    >
                      <span className="avatar" aria-hidden="true">
                        {initials(p.name)}
                      </span>
                      <span className="person-name">{p.name}</span>
                      <span className="person-count">{p.count}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h2 className="label">Quick filters</h2>
            <div className="chips">
              {QUICK.map((f) => (
                <button key={f.key} type="button" className="chip" aria-pressed={quick.has(f.key)} onClick={() => toggleQuick(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          {browseData && browseData.tags.length > 0 && (
            <section>
              <h2 className="label">Tags</h2>
              <div className="chips">
                {[
                  // chosen tags stay visible even when they're past the first few
                  ...browseData.tags.filter((t, i) => allTags || i < TAGS_SHOWN || tags.includes(t.name)),
                ].map((t) => (
                  <button key={t.name} type="button" className="chip" aria-pressed={tags.includes(t.name)} onClick={() => toggleTag(t.name)}>
                    {t.name} <span className="chip-count">{t.count}</span>
                  </button>
                ))}
              </div>
              {browseData.tags.length > TAGS_SHOWN && (
                <button type="button" className="text-button small" onClick={() => setAllTags((v) => !v)}>
                  {allTags ? 'Fewer tags' : `All ${browseData.tags.length} tags`}
                </button>
              )}
            </section>
          )}

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
            <h2>{filtered ? 'Matching recipes' : 'Recently added'}</h2>
            <div className="results-tools">
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
                'The box is empty so far. Recipes will show up here as family adds them.'
              )}
            </div>
          )}

          {listData && listData.fullCount === 0 && listData.recipes.length > 0 && (
            <p className="notice">No recipe has all of those words. Here are the closest.</p>
          )}
          {listData && listData.fullCount > 0 && (
            <div className="card-grid">
              {listData.recipes.slice(0, listData.fullCount).map((r) => (
                <RecipeCardView key={r.slug} recipe={r} />
              ))}
            </div>
          )}
          {listData && listData.recipes.length > listData.fullCount && (
            <>
              {listData.fullCount > 0 && (
                <h3 className="partial-head">
                  Partial matches <span className="small muted">missing a word or two</span>
                </h3>
              )}
              <div className="card-grid">
                {listData.recipes.slice(listData.fullCount).map((r) => (
                  <RecipeCardView key={r.slug} recipe={r}>
                    {r.missed && <p className="small missed">No match for: {r.missed.join(', ')}</p>}
                  </RecipeCardView>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

export function RecipeCardView({ recipe, children }: { recipe: RecipeCard; children?: ReactNode }) {
  const made = recipe.madeCount ? `MADE ${recipe.madeCount}×` : 'NOT MADE YET';
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
          <h3>{recipe.title}</h3>
          {recipe.source && (
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

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}
