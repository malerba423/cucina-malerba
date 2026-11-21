import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DEFAULT_STAPLES } from '../../../shared/search';
import type { FridgeHit, FridgeResponse } from '../../../shared/types';
import { useApi } from '../api';
import { Link } from '../router';
import { RecipeCardView } from './HomePage';
import { entryFromText } from '../../../shared/shopping';
import { shopping, useShoppingEntries } from '../shoppingList';

// What you have lives in this browser only (like the shopping list), so
// fridge mode works for everyone and nothing is stored on the server.
const STORAGE_KEY = 'cucina.fridge.v1';

type Saved = { have: string[]; useStaples: boolean; staples: string[] };

function load(): Saved {
  const fallback: Saved = { have: [], useStaples: true, staples: DEFAULT_STAPLES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<Saved>;
    const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 40) : null);
    return {
      have: strings(v.have) ?? [],
      useStaples: typeof v.useStaples === 'boolean' ? v.useStaples : true,
      staples: strings(v.staples) ?? DEFAULT_STAPLES,
    };
  } catch {
    return fallback;
  }
}

/** "chicken, rice\nlemon" → ["chicken", "rice", "lemon"] */
const splitItems = (text: string) =>
  text
    .split(/[,\n;]+/)
    .map((s) => s.trim().toLowerCase().slice(0, 40))
    .filter(Boolean);

function addTo(list: string[], text: string): string[] {
  const next = [...list];
  for (const item of splitItems(text)) if (!next.includes(item)) next.push(item);
  return next.slice(0, 40);
}

export function FridgePage() {
  const [saved, setSaved] = useState<Saved>(load);
  const [entry, setEntry] = useState('');
  const [stapleEntry, setStapleEntry] = useState('');
  const [editStaples, setEditStaples] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // private browsing or storage full: the list just won't be remembered
    }
  }, [saved]);

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    if (!entry.trim()) return;
    setSaved((s) => ({ ...s, have: addTo(s.have, entry) }));
    setEntry('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !entry && saved.have.length) {
      setSaved((s) => ({ ...s, have: s.have.slice(0, -1) }));
    }
  };
  const remove = (item: string) => setSaved((s) => ({ ...s, have: s.have.filter((h) => h !== item) }));

  const addStaple = (e: FormEvent) => {
    e.preventDefault();
    setSaved((s) => ({ ...s, staples: addTo(s.staples, stapleEntry) }));
    setStapleEntry('');
  };

  const params = new URLSearchParams();
  if (saved.have.length) params.set('have', saved.have.join(','));
  if (saved.useStaples && saved.staples.length) params.set('staples', saved.staples.join(','));
  const results = useApi<FridgeResponse>(saved.have.length ? `/api/fridge?${params.toString()}` : null);
  const data = saved.have.length && 'data' in results ? results.data : undefined;

  return (
    <main className="fridge">
      <header className="fridge-head">
        <p className="eyebrow">FRIDGE MODE</p>
        <h1>What's in the fridge?</h1>
        <p className="muted">Add what you have. We'll find what you can make now, or with one or two things more.</p>
      </header>

      <form className="fridge-entry" onSubmit={add}>
        <label className="visually-hidden" htmlFor="fridge-item">
          Add an ingredient
        </label>
        <div className="token-field">
          {saved.have.map((item) => (
            <span key={item} className="token">
              {item}
              <button type="button" aria-label={`Remove ${item}`} onClick={() => remove(item)}>
                ×
              </button>
            </span>
          ))}
          <input
            id="fridge-item"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => entry.trim() && add()}
            placeholder={saved.have.length ? 'Add more…' : 'chicken thighs, rice, lemon…'}
            autoComplete="off"
            enterKeyHint="done"
          />
        </div>
        <div className="fridge-entry-actions">
          <button type="submit" className="button button-primary">
            Add
          </button>
          {saved.have.length > 0 && (
            <button type="button" className="text-button" onClick={() => setSaved((s) => ({ ...s, have: [] }))}>
              Clear all
            </button>
          )}
        </div>
      </form>

      <section className="staples">
        <label className="check">
          <input type="checkbox" checked={saved.useStaples} onChange={(e) => setSaved((s) => ({ ...s, useStaples: e.target.checked }))} />
          <span>Assume I have the basics</span>
        </label>
        {saved.useStaples && (
          <p className="small muted">
            {saved.staples.join(', ') || 'none'} ·{' '}
            <button type="button" className="text-button" onClick={() => setEditStaples((v) => !v)}>
              {editStaples ? 'Done' : 'Edit'}
            </button>
          </p>
        )}
        {saved.useStaples && editStaples && (
          <div className="staples-edit">
            <div className="chips">
              {saved.staples.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  aria-label={`Remove ${s}`}
                  onClick={() => setSaved((v) => ({ ...v, staples: v.staples.filter((x) => x !== s) }))}
                >
                  {s} ×
                </button>
              ))}
            </div>
            <form className="row" onSubmit={addStaple}>
              <label className="field">
                <span className="visually-hidden">Add a basic</span>
                <input value={stapleEntry} onChange={(e) => setStapleEntry(e.target.value)} placeholder="butter, garlic…" />
              </label>
              <button type="submit" className="button">
                Add
              </button>
              <button type="button" className="text-button" onClick={() => setSaved((v) => ({ ...v, staples: DEFAULT_STAPLES }))}>
                Reset
              </button>
            </form>
          </div>
        )}
      </section>

      {!saved.have.length ? (
        <p className="notice">Start with the main things: a protein, a vegetable or two, whatever needs using up.</p>
      ) : results.status === 'error' ? (
        <p className="notice notice-warn">Couldn't check recipes: {results.message}</p>
      ) : data ? (
        data.ready.length + data.close.length + data.more.length === 0 ? (
          <p className="notice">
            Nothing in the box uses those yet. Try fewer or more general words ("chicken" instead of "chicken thighs"), or{' '}
            <Link to="/">browse everything</Link>.
          </p>
        ) : (
          <div aria-busy={results.status === 'loading'}>
            {data.ready.length > 0 && <Results title="Ready to make" hits={data.ready} />}
            {data.close.length > 0 && <Results title="One or two things away" hits={data.close} />}
            {data.more.length > 0 && <Results title="Uses what you have" hint="These need a few more things." hits={data.more} />}
          </div>
        )
      ) : (
        <p className="muted">Checking the box…</p>
      )}
    </main>
  );
}

const SHOW_MISSING = 4;

function Results({ title, hint, hits }: { title: string; hint?: string; hits: FridgeHit[] }) {
  const entries = useShoppingEntries();
  const onList = (slug: string) => entries.some((e) => e.recipe?.slug === slug);
  return (
    <section className="fridge-results">
      <h2>
        {title} <span className="mono muted small">{hits.length}</span>
      </h2>
      {hint && <p className="small muted fridge-hint">{hint}</p>}
      <div className="card-grid">
        {hits.map((h) => (
          <div key={h.recipe.slug} className="collection-item">
          <RecipeCardView recipe={h.recipe}>
            {h.missing.length ? (
              <p className="fridge-need small">
                <strong>Need{h.missing.length > 2 ? ` ${h.missing.length}` : ''}:</strong> {h.missing.slice(0, SHOW_MISSING).join(' · ')}
                {h.missing.length > SHOW_MISSING ? ` · +${h.missing.length - SHOW_MISSING} more` : ''}
              </p>
            ) : (
              <p className="fridge-have small">
                Uses {h.matched} of your things
              </p>
            )}
          </RecipeCardView>
          {h.missing.length > 0 &&
            (onList(h.recipe.slug) ? (
              <Link to="/shopping" className="small">
                On your shopping list ✓
              </Link>
            ) : (
              <button
                type="button"
                className="text-button small"
                onClick={() => shopping.add(h.missing.map((m) => entryFromText(m, { slug: h.recipe.slug, title: h.recipe.title })))}
              >
                Add the missing {h.missing.length === 1 ? 'one' : h.missing.length} to the shopping list
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
