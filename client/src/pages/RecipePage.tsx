import { useEffect, useMemo, useState } from 'react';
import { SITE_NAME } from '../../../shared/site';
import type { IngredientLine, RecipeDetail } from '../../../shared/types';
import { SOURCE_LABELS } from '../../../shared/types';
import { formatMinutes, formatQuantity, formatTimer, presentIngredient, UNIT_SYSTEMS, type UnitSystem } from '../../../shared/units';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { canEditRecipe } from '../../../shared/auth';
import { longDate, tintFor } from '../format';
import { Link } from '../router';
import { NotFoundPage } from './NotFoundPage';

export function RecipePage({ slug }: { slug: string }) {
  const state = useApi<RecipeDetail>(`/api/recipes/${encodeURIComponent(slug)}`);

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
  return <Recipe key={recipe.slug} recipe={recipe} />;
}

function Recipe({ recipe }: { recipe: RecipeDetail }) {
  const { user } = useAuth();
  const canEdit = canEditRecipe(user, recipe.addedBy?.id ?? null);
  const base = recipe.servings ?? null;
  const [amount, setAmount] = useState<number>(base ?? 1); // servings, or a multiplier when servings is unknown
  const [system, setSystem] = useState<UnitSystem>(() => {
    try {
      const saved = localStorage.getItem('units');
      return UNIT_SYSTEMS.includes(saved as UnitSystem) ? (saved as UnitSystem) : 'us';
    } catch {
      return 'us';
    }
  });
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const factor = base ? amount / base : amount;
  const step = base ? (base > 12 ? Math.max(1, Math.round(base / 4)) : 1) : 0.5;
  const minimum = step;

  const chooseSystem = (s: UnitSystem) => {
    setSystem(s);
    try {
      localStorage.setItem('units', s);
    } catch {
      // storage blocked: the choice just won't be remembered
    }
  };

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
          {recipe.description && <p className="muted">{recipe.description}</p>}

          <div className="source-card ruled">
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
            <div>
              <span className="mono small muted">ADDED </span>
              {recipe.addedBy ? `by ${recipe.addedBy.name}, ` : ''}
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
            <button type="button" className="button" onClick={() => window.print()}>
              Print card
            </button>
            {canEdit && (
              <Link to={`/recipes/${encodeURIComponent(recipe.slug)}/edit`} className="button">
                Edit
              </Link>
            )}
          </div>
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

      {recipe.cookLogs.length > 0 && (
        <section className="made-log">
          <h2>Made it · {recipe.madeCount} {recipe.madeCount === 1 ? 'time' : 'times'}</h2>
          <div className="log-grid">
            {recipe.cookLogs.map((log) => (
              <div key={log.id} className="log-entry">
                <p className="mono small muted">
                  {longDate(log.cookedOn).toUpperCase()}
                  {log.person ? ` · ${log.person.toUpperCase()}` : ''}
                  {log.rating ? ` · ${'★'.repeat(log.rating)}` : ''}
                </p>
                {log.note && <p>{log.note}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function IngredientText({ line, factor, system }: { line: IngredientLine; factor: number; system: UnitSystem }) {
  const amount = presentIngredient(line, factor, system);
  if (!amount || !line.item) return <span>{line.rawText}</span>;
  const text = `${amount.amount}${amount.unit ? ` ${amount.unit}` : ''}`;
  return (
    <span>
      {amount.approx ? <Estimated text={text} source={line.rawText} /> : <strong>{text}</strong>} {line.item}
      {line.note ? <span className="muted">, {line.note}</span> : null}
    </span>
  );
}

// A weight converted from cups/spoons: dotted underline, original line on hover,
// and on tap (phones have no hover). preventDefault keeps the tap from also
// ticking the ingredient's checkbox.
function Estimated({ text, source }: { text: string; source: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="estimate"
        title={`Estimated from: ${source}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {text}
      </button>
      {open && <span className="estimate-source muted"> (from {source})</span>}
    </>
  );
}

function groupIngredients(lines: IngredientLine[]) {
  const groups: { label: string | null; lines: IngredientLine[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.label === line.groupLabel) last.lines.push(line);
    else groups.push({ label: line.groupLabel, lines: [line] });
  }
  return groups;
}

function describeSource(r: RecipeDetail): { label: string; url: string | null } {
  if (r.sourceType === 'original') return { label: r.sourcePerson ? `${r.sourcePerson} (original)` : 'Original', url: null };
  const label = r.sourcePerson ?? r.sourceName ?? SOURCE_LABELS[r.sourceType];
  const url = r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl) ? r.sourceUrl : null;
  return { label, url };
}
