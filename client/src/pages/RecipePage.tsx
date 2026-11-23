import { useEffect, useMemo, useState } from 'react';
import { SITE_NAME } from '../../../shared/site';
import type { RecipeDetail } from '../../../shared/types';
import { SOURCE_LABELS } from '../../../shared/types';
import { formatMinutes, formatQuantity, formatTimer } from '../../../shared/units';
import { groupIngredients, IngredientText, useUnitSystem } from '../ingredients';
import { entriesFromRecipe } from '../../../shared/shopping';
import { shopping, useShoppingEntries } from '../shoppingList';
import { send, useApi } from '../api';
import { useAuth } from '../auth';
import { canEditRecipe } from '../../../shared/auth';
import { longDate, possessive, tintFor } from '../format';
import { Link, useRouter } from '../router';
import { CollectionsPicker, MadeItSection, NotesSection } from './RecipeFamily';
import { NotFoundPage } from './NotFoundPage';

export function RecipePage({ slug }: { slug: string }) {
  const [version, setVersion] = useState(0);
  const state = useApi<RecipeDetail>(`/api/recipes/${encodeURIComponent(slug)}${version ? `?v=${version}` : ''}`);

  useEffect(() => {
    if (state.status === 'ok') document.title = `${state.data.title} · ${SITE_NAME}`;
  }, [state]);

  if (state.status === 'not-found') return <NotFoundPage what="recipe" />;
  if (state.status === 'error')
    return (
      <main className="narrow">
        <p className="notice notice-warn">Couldn't load this recipe: {state.message}</p>
      </main>
    );
  if (state.status === 'loading' && !state.data)
    return (
      <main className="narrow">
        <p className="muted" role="status">
          Loading…
        </p>
      </main>
    );

  const recipe = state.data!;
  return <Recipe key={recipe.slug} recipe={recipe} reload={() => setVersion((v) => v + 1)} />;
}

function Recipe({ recipe, reload }: { recipe: RecipeDetail; reload: () => void }) {
  const { user } = useAuth();
  const { search } = useRouter();
  const canEdit = canEditRecipe(user, recipe.addedBy?.id ?? null);
  const base = recipe.servings ?? null;
  const [amount, setAmount] = useState<number>(base ?? 1); // servings, or a multiplier when servings is unknown
  const [system, chooseSystem] = useUnitSystem();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const listEntries = useShoppingEntries();
  const onList = listEntries.some((e) => e.recipe?.slug === recipe.slug);
  const [listNote, setListNote] = useState<string | null>(null);

  const factor = base ? amount / base : amount;
  const step = base ? (base > 12 ? Math.max(1, Math.round(base / 4)) : 1) : 0.5;
  const minimum = step;

  const groups = useMemo(() => groupIngredients(recipe.ingredients), [recipe.ingredients]);
  const source = describeSource(recipe);

  return (
    <main className="recipe">
      <nav className="crumbs mono" aria-label="Breadcrumb">
        <Link to="/">ALL RECIPES</Link> / <span>{SOURCE_LABELS[recipe.sourceType].toUpperCase()}</span>
      </nav>

      <section className="recipe-hero">
        <div
          className="recipe-photo"
          style={recipe.photoUrl ? { backgroundImage: `url(${JSON.stringify(recipe.photoUrl)})` } : { backgroundColor: tintFor(recipe.slug) }}
          role={recipe.photoUrl ? 'img' : undefined}
          aria-label={recipe.photoUrl ? recipe.title : undefined}
        />
        <div className="recipe-intro">
          {recipe.tags.length > 0 && <p className="eyebrow">{recipe.tags.join(' · ').toUpperCase()}</p>}
          <h1>{recipe.title}</h1>
          {recipe.parent && (
            <p className="variation-of small">
              A variation of <Link to={`/recipes/${encodeURIComponent(recipe.parent.slug)}`}>{recipe.parent.title}</Link>
            </p>
          )}
          {recipe.description && <p className="muted">{recipe.description}</p>}

          <div className="source-card ruled">
            {recipe.sourcePerson ? (
              <>
                <div className="family-credit">
                  From <strong>{possessive(recipe.sourcePerson)}</strong> kitchen
                  {recipe.sourceType === 'original' ? ' · an original' : ''}
                  {recipe.sourceNote && !source.url ? `, ${recipe.sourceNote}` : ''}
                </div>
                {source.url && (
                  <div>
                    <span className="mono small muted">ORIGIN / INSPIRATION </span>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      <strong>{hostOf(source.url)}</strong> ↗
                    </a>
                    {recipe.sourceNote ? `, ${recipe.sourceNote}` : ''}
                  </div>
                )}
              </>
            ) : (
            <div>
              <span className="mono small muted">SOURCE </span>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  <strong>{source.label}</strong>
                </a>
              ) : (
                <strong>{source.label}</strong>
              )}
              {recipe.sourceNote ? `, ${recipe.sourceNote}` : ''}
            </div>
            )}
            <div>
              <span className="mono small muted">{recipe.addedBy ? 'SHARED BY ' : 'ADDED '}</span>
              {recipe.addedBy ? `${recipe.addedBy.name}, ` : ''}
              {longDate(recipe.createdAt)}
            </div>
          </div>

          <div className="chips">
            {recipe.prepMinutes ? <span className="chip static">Prep {formatMinutes(recipe.prepMinutes)}</span> : null}
            {recipe.cookMinutes ? <span className="chip static">Cook {formatMinutes(recipe.cookMinutes)}</span> : null}
            {recipe.totalMinutes ? <span className="chip static">Total {formatMinutes(recipe.totalMinutes)}</span> : null}
            {recipe.madeCount > 0 && (
              <span className="chip static">
                {recipe.avgRating != null ? `★ ${recipe.avgRating} · ` : ''}made {recipe.madeCount}×
              </span>
            )}
          </div>

          <div className="actions no-print">
            {recipe.steps.length > 0 && (
              <Link to={`/recipes/${encodeURIComponent(recipe.slug)}/cook${factor !== 1 ? `?amount=${amount}` : ''}`} className="button button-primary">
                Start cooking
              </Link>
            )}
            <button type="button" className="button" onClick={() => printAs('page')}>
              Print
            </button>
            <button type="button" className="button" onClick={() => printAs('card')} title="Just the ingredients and steps, sized for a 4×6 index card">
              Print minimal
            </button>
            {canEdit && (
              <Link to={`/recipes/${encodeURIComponent(recipe.slug)}/edit`} className="button">
                Edit
              </Link>
            )}
            {/* Hidden only on recipes that are already plainly yours: shared by you and not credited to someone else. */}
            {user &&
              (recipe.addedBy?.id !== user.id || (recipe.sourcePerson != null && recipe.sourcePerson.trim().toLowerCase() !== user.name.trim().toLowerCase())) && (
                <SaveButton recipe={recipe} onChanged={reload} />
              )}
            {user && (
              <Link to={`/recipes/new?variationOf=${encodeURIComponent(recipe.slug)}`} className="button" title="Save your own version, linked to this one">
                Make a variation
              </Link>
            )}
          </div>

          <CollectionsPicker recipe={recipe} me={user} onChanged={reload} />

          {recipe.variations.length > 0 && (
            <p className="variations small">
              <span className="mono muted">VARIATIONS </span>
              {recipe.variations.map((v, i) => (
                <span key={v.slug}>
                  {i > 0 && ' · '}
                  <Link to={`/recipes/${encodeURIComponent(v.slug)}`}>{v.title}</Link>
                  {v.addedBy ? <span className="muted"> ({v.addedBy})</span> : null}
                </span>
              ))}
            </p>
          )}
        </div>
      </section>

      <section className="recipe-body">
        <div className="ingredients">
          <div className="section-head">
            <h2>Ingredients</h2>
            <div className="controls no-print">
              <div className="stepper" role="group" aria-label={base ? `Amount: ${formatQuantity(amount)} ${recipe.yieldLabel ?? 'servings'}` : 'Scale'}>
                <button type="button" aria-label="Less" disabled={amount <= minimum} onClick={() => setAmount((a) => Math.max(minimum, a - step))}>
                  −
                </button>
                <span className="mono">
                  {base ? `${formatQuantity(amount)} ${(recipe.yieldLabel ?? 'servings').toUpperCase()}` : `×${formatQuantity(amount)}`}
                </span>
                <button type="button" aria-label="More" onClick={() => setAmount((a) => a + step)}>
                  +
                </button>
              </div>
              <div className="toggle mono" role="group" aria-label="Units">
                <button type="button" aria-pressed={system === 'us'} onClick={() => chooseSystem('us')}>
                  US
                </button>
                <button type="button" aria-pressed={system === 'metric'} onClick={() => chooseSystem('metric')}>
                  METRIC
                </button>
                <button type="button" aria-pressed={system === 'grams'} onClick={() => chooseSystem('grams')} title="Weigh everything in grams">
                  GRAMS
                </button>
              </div>
            </div>
          </div>

          <div className="list-add no-print">
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                // Ticked ingredients are things you already have: leave them off.
                const lines = recipe.ingredients.filter((i) => !checked.has(i.id));
                if (onList) shopping.removeRecipe(recipe.slug);
                shopping.add(entriesFromRecipe(recipe, lines, factor));
                setListNote(`${onList ? 'Updated' : 'Added'} ${lines.length} ${lines.length === 1 ? 'item' : 'items'}${checked.size ? ' (skipped the ticked ones)' : ''}.`);
              }}
            >
              {onList ? 'Update shopping list' : 'Add to shopping list'}
            </button>
            {listNote ? (
              <span className="small muted" role="status">
                {listNote} <Link to="/shopping">See the list</Link>
              </span>
            ) : (
              <span className="small muted">Tick what you already have first and it's left off.</span>
            )}
          </div>

          {factor !== 1 && (
            <p className="small muted no-print">
              Scaled ×{formatQuantity(factor)}.{' '}
              <button type="button" className="text-button" onClick={() => setAmount(base ?? 1)}>
                Reset
              </button>
            </p>
          )}

          {groups.map((g, gi) => (
            <div key={gi} className="ingredient-group">
              {g.label && <h3 className="label">{g.label}</h3>}
              <ul className="checklist">
                {g.lines.map((line) => {
                  const done = checked.has(line.id);
                  return (
                    <li key={line.id}>
                      <label className={done ? 'is-done' : undefined}>
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() =>
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(line.id)) next.delete(line.id);
                              else next.add(line.id);
                              return next;
                            })
                          }
                        />
                        <IngredientText line={line} factor={factor} system={system} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="steps">
          <h2>Steps</h2>
          <ol>
            {recipe.steps.map((s, i) => (
              <li key={s.id}>
                <span className="step-number mono" aria-hidden="true">
                  {i + 1}
                </span>
                <p>
                  {s.text}
                  {s.timerSeconds ? <span className="timer mono"> TIMER {formatTimer(s.timerSeconds)}</span> : null}
                </p>
              </li>
            ))}
          </ol>
          {system !== 'us' && /°F/.test(recipe.steps.map((s) => s.text).join(' ')) && (
            <p className="small muted">Oven temperatures are shown as written.</p>
          )}
        </div>
      </section>

      <NotesSection recipe={recipe} me={user} onChanged={reload} />
      <MadeItSection recipe={recipe} me={user} startOpen={search.get('made') === '1'} onChanged={reload} />
    </main>
  );
}

function describeSource(r: RecipeDetail): { label: string; url: string | null } {
  if (r.sourceType === 'original') return { label: r.sourcePerson ? `${r.sourcePerson} (original)` : 'Original', url: null };
  const label = r.sourcePerson ?? r.sourceName ?? SOURCE_LABELS[r.sourceType];
  const url = r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl) ? r.sourceUrl : null;
  return { label, url };
}

/** Prints the recipe as a full page or a 4×6 index card (the print styles key off data-print). */
function printAs(kind: 'page' | 'card') {
  const root = document.documentElement;
  root.dataset.print = kind;
  const done = () => {
    delete root.dataset.print;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

/** "Add to my recipes": puts someone else's recipe under Mine without changing whose it is. */
function SaveButton({ recipe, onChanged }: { recipe: RecipeDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await send(`/api/recipes/${encodeURIComponent(recipe.slug)}/saved`, recipe.saved ? 'DELETE' : 'PUT');
    setBusy(false);
    onChanged();
  };
  return (
    <button
      type="button"
      className={recipe.saved ? 'button is-saved' : 'button'}
      onClick={toggle}
      disabled={busy}
      aria-pressed={recipe.saved}
      title={recipe.saved ? 'Shows under Mine on the home page. Click to take it out.' : 'Shows it under Mine on the home page'}
    >
      {recipe.saved ? '✓ In my recipes' : '+ Add to my recipes'}
    </button>
  );
}

/** "https://www.tasteofhome.com/recipes/…" → "tasteofhome.com" */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
