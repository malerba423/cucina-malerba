import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { ingredientsForStep, stepParts } from '../../../shared/cook';
import { SITE_NAME } from '../../../shared/site';
import type { IngredientLine, RecipeDetail } from '../../../shared/types';
import { formatQuantity, formatTimer } from '../../../shared/units';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { groupIngredients, IngredientText, useUnitSystem } from '../ingredients';
import { Link, useRouter } from '../router';
import { clock, remainingMs, useTimers, type Timer } from '../timers';
import { useWakeLock } from '../wakeLock';
import { NotFoundPage } from './NotFoundPage';

/** /recipes/:slug/cook */
export function CookPage({ slug }: { slug: string }) {
  const state = useApi<RecipeDetail>(`/api/recipes/${encodeURIComponent(slug)}`);
  if (state.status === 'not-found') return <NotFoundPage what="recipe" />;
  if (state.status === 'error')
    return (
      <main className="narrow">
        <p className="notice notice-warn">Couldn't load this recipe: {state.message}</p>
      </main>
    );
  if (state.status !== 'ok')
    return (
      <main className="narrow">
        <p className="muted">Loading…</p>
      </main>
    );
  return <Cook key={state.data.slug} recipe={state.data} />;
}

// Where you are (step, ticked ingredients) is kept for this tab, so a reload
// or a locked phone comes back to the same place.
function useSessionState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage blocked
    }
  }, [key, value]);
  return [value, setValue];
}

const SIZES = ['m', 'l', 'xl'] as const;
type Size = (typeof SIZES)[number];

function Cook({ recipe }: { recipe: RecipeDetail }) {
  const { search } = useRouter();
  const { user } = useAuth();
  const key = `cook.${recipe.slug}`;
  const [system, chooseSystem] = useUnitSystem();
  const base = recipe.servings ?? null;
  const amount = Number(search.get('amount')) > 0 ? Number(search.get('amount')) : (base ?? 1);
  const factor = base ? amount / base : amount;

  // -1 = gather screen, steps.length = finished
  const [index, setIndex] = useSessionState<number>(`${key}.step`, -1);
  const [checked, setChecked] = useSessionState<number[]>(`${key}.checked`, []);
  const [size, setSize] = useState<Size>(() => {
    try {
      const s = localStorage.getItem('cookTextSize');
      return SIZES.includes(s as Size) ? (s as Size) : 'l';
    } catch {
      return 'l';
    }
  });
  const timers = useTimers(`${key}.timers`);
  const wake = useWakeLock(true);

  const steps = recipe.steps;
  const last = steps.length - 1;
  const at = Math.min(Math.max(index, -1), steps.length);
  const step = at >= 0 && at <= last ? steps[at] : null;

  const stepIngredients = useMemo(
    () => steps.map((s) => new Set(ingredientsForStep(s.text, recipe.ingredients))),
    [steps, recipe.ingredients],
  );
  const usedHere = step ? recipe.ingredients.filter((i) => stepIngredients[at].has(i.id)) : [];

  useEffect(() => {
    document.title = `Cooking: ${recipe.title} · ${SITE_NAME}`;
  }, [recipe.title]);

  const go = (i: number) => {
    setIndex(Math.min(Math.max(i, -1), steps.length));
    window.scrollTo({ top: 0 });
  };

  // Arrow keys and space, for a keyboard or a page-turner pedal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) && e.key === ' ') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        go(at + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        go(at - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe left/right between steps.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1));
  };

  const toggle = (id: number) => setChecked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const chooseSize = (s: Size) => {
    setSize(s);
    try {
      localStorage.setItem('cookTextSize', s);
    } catch {
      // not remembered
    }
  };

  const scaled = factor !== 1 ? (base ? `${formatQuantity(amount)} ${recipe.yieldLabel ?? 'servings'}` : `×${formatQuantity(factor)}`) : null;

  return (
    <div className={`cook size-${size}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="cook-bar">
        <Link to={`/recipes/${encodeURIComponent(recipe.slug)}`} className="cook-exit" aria-label="Leave cook mode">
          ×
        </Link>
        <div className="cook-title">
          <strong>{recipe.title}</strong>
          <span className="mono small muted">
            {step ? `STEP ${at + 1} OF ${steps.length}` : at < 0 ? 'GATHER' : 'DONE'}
            {scaled ? ` · ${scaled.toUpperCase()}` : ''}
          </span>
        </div>
        <div className="cook-tools">
          <div className="toggle mono" role="group" aria-label="Units">
            {(['us', 'metric', 'grams'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={system === s} onClick={() => chooseSystem(s)}>
                {s === 'us' ? 'US' : s === 'metric' ? 'METRIC' : 'G'}
              </button>
            ))}
          </div>
          <div className="toggle mono" role="group" aria-label="Text size">
            {SIZES.map((s) => (
              <button key={s} type="button" aria-pressed={size === s} onClick={() => chooseSize(s)} aria-label={`Text size ${s}`}>
                <span className={`aa aa-${s}`}>A</span>
              </button>
            ))}
          </div>
          <span className={`wake mono small ${wake}`} title={wake === 'on' ? 'The screen will stay on' : wake === 'unsupported' ? "This browser can't keep the screen on" : 'Screen may dim'}>
            {wake === 'on' ? '☀ SCREEN ON' : wake === 'unsupported' ? '' : '☾ MAY DIM'}
          </span>
        </div>
      </header>

      <div className="cook-progress" aria-hidden="true">
        <span style={{ width: `${steps.length ? (Math.max(0, Math.min(at + 1, steps.length)) / steps.length) * 100 : 0}%` }} />
      </div>

      <div className="cook-body">
        <nav className="cook-rail" aria-label="Steps">
          <ol>
            <li>
              <button type="button" aria-current={at === -1 ? 'step' : undefined} onClick={() => go(-1)}>
                <span className="mono">·</span> Gather
              </button>
            </li>
            {steps.map((s, i) => (
              <li key={s.id}>
                <button type="button" aria-current={at === i ? 'step' : undefined} className={i < at ? 'is-past' : undefined} onClick={() => go(i)}>
                  <span className="mono">{i + 1}</span> {s.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="cook-main" id="cook-main">
          {at < 0 ? (
            <Gather recipe={recipe} factor={factor} system={system} checked={checked} toggle={toggle} />
          ) : step ? (
            <section className="cook-step" aria-live="polite">
              <p className="cook-step-number mono">STEP {at + 1}</p>
              <p className="cook-step-text">
                {stepParts(step.text).map((part, i) =>
                  typeof part === 'string' ? (
                    <span key={i}>{part}</span>
                  ) : (
                    <button
                      key={i}
                      type="button"
                      className="time-button"
                      onClick={() => timers.start(`Step ${at + 1}: ${part.text}`, part.seconds, at)}
                      title={`Start a ${formatTimer(part.seconds)} timer`}
                    >
                      <span aria-hidden="true">▶</span> {part.text}
                    </button>
                  ),
                )}
              </p>
              {/°F/.test(step.text) && system !== 'us' && <p className="small muted">Oven temperatures are shown as written.</p>}
            </section>
          ) : (
            <section className="cook-done">
              <p className="cook-step-number mono">ALL DONE</p>
              <h1>Enjoy it.</h1>
              <p className="muted">That was the last step.</p>
              <div className="row">
                {user && (
                  <Link to={`/recipes/${encodeURIComponent(recipe.slug)}?made=1`} className="button button-primary">
                    Log that you made it
                  </Link>
                )}
                <Link to={`/recipes/${encodeURIComponent(recipe.slug)}`} className={user ? 'button' : 'button button-primary'}>
                  Back to the recipe
                </Link>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setChecked([]);
                    go(-1);
                  }}
                >
                  Start over
                </button>
              </div>
            </section>
          )}
        </main>

        {step && (
          <aside className="cook-side" aria-label="Ingredients for this step">
            <h2 className="label">{usedHere.length ? 'For this step' : 'Ingredients'}</h2>
            <IngredientList
              lines={usedHere.length ? usedHere : recipe.ingredients}
              factor={factor}
              system={system}
              checked={checked}
              toggle={toggle}
            />
            {usedHere.length > 0 && (
              <details className="cook-all">
                <summary className="small">All ingredients</summary>
                <IngredientList lines={recipe.ingredients} factor={factor} system={system} checked={checked} toggle={toggle} grouped />
              </details>
            )}
          </aside>
        )}
      </div>

      <footer className="cook-foot">
        {timers.timers.length > 0 && <TimerTray timers={timers} go={go} />}
        <div className="cook-nav">
          <button type="button" className="button cook-prev" onClick={() => go(at - 1)} disabled={at < 0}>
            ← Back
          </button>
          <button type="button" className="button button-primary cook-next" onClick={() => go(at + 1)} disabled={at >= steps.length}>
            {at < 0 ? 'Start step 1 →' : at === last ? 'Finish ✓' : 'Next step →'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Gather({
  recipe,
  factor,
  system,
  checked,
  toggle,
}: {
  recipe: RecipeDetail;
  factor: number;
  system: ReturnType<typeof useUnitSystem>[0];
  checked: number[];
  toggle: (id: number) => void;
}) {
  const left = recipe.ingredients.filter((i) => !checked.includes(i.id)).length;
  return (
    <section className="cook-gather">
      <p className="cook-step-number mono">BEFORE YOU START</p>
      <h1>Gather everything</h1>
      <p className="muted">
        {recipe.ingredients.length === 0
          ? 'This recipe has no ingredient list.'
          : left === 0
            ? 'All set. On to step 1.'
            : `Tick things off as you get them out. ${left} to go.`}
      </p>
      <IngredientList lines={recipe.ingredients} factor={factor} system={system} checked={checked} toggle={toggle} grouped large />
    </section>
  );
}

function IngredientList({
  lines,
  factor,
  system,
  checked,
  toggle,
  grouped = false,
  large = false,
}: {
  lines: IngredientLine[];
  factor: number;
  system: ReturnType<typeof useUnitSystem>[0];
  checked: number[];
  toggle: (id: number) => void;
  grouped?: boolean;
  large?: boolean;
}) {
  const groups = grouped ? groupIngredients(lines) : [{ label: null, lines }];
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className="ingredient-group">
          {g.label && <h3 className="label">{g.label}</h3>}
          <ul className={`checklist${large ? ' checklist-large' : ''}`}>
            {g.lines.map((line) => {
              const done = checked.includes(line.id);
              return (
                <li key={line.id}>
                  <label className={done ? 'is-done' : undefined}>
                    <input type="checkbox" checked={done} onChange={() => toggle(line.id)} />
                    <IngredientText line={line} factor={factor} system={system} />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function TimerTray({ timers, go }: { timers: ReturnType<typeof useTimers>; go: (i: number) => void }) {
  return (
    <ul className="timer-tray" aria-label="Timers">
      {timers.timers.map((t: Timer) => {
        const left = remainingMs(t, timers.now);
        const done = t.doneAt != null;
        const running = t.endsAt != null;
        return (
          <li key={t.id} className={`timer-chip${done ? ' is-done' : ''}${!running && !done ? ' is-paused' : ''}`} role={done ? 'alert' : undefined}>
            <button type="button" className="timer-label small" onClick={() => go(t.step)} title="Go to that step">
              {t.label}
            </button>
            <span className="timer-clock mono">{done ? 'DONE' : clock(left)}</span>
            <span className="timer-actions">
              {!done && (
                <button type="button" onClick={() => (running ? timers.pause(t.id) : timers.resume(t.id))}>
                  {running ? 'Pause' : 'Resume'}
                </button>
              )}
              <button type="button" onClick={() => timers.addMinute(t.id)}>
                +1 min
              </button>
              <button type="button" onClick={() => timers.dismiss(t.id)} aria-label={done ? 'Dismiss timer' : 'Cancel timer'}>
                {done ? 'OK' : '×'}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
