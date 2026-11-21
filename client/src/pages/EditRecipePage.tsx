import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { canEditRecipe } from '../../../shared/auth';
import { ingredientsToText, parseIngredientText, parseStepText } from '../../../shared/parse';
import type { RecipeInput } from '../../../shared/recipeInput';
import { SOURCE_TYPES, type RecipeDetail, type SourceType } from '../../../shared/types';
import { formatQuantity, formatTimer } from '../../../shared/units';
import { send, useApi } from '../api';
import { useAuth } from '../auth';
import { resizePhoto, uploadPhoto } from '../image';
import { Link, useRouter } from '../router';
import { NotFoundPage } from './NotFoundPage';

const SOURCE_CHOICES: Record<SourceType, string> = {
  person: 'A person',
  original: 'Our original',
  website: 'Website',
  social: 'Social post',
  cookbook: 'Cookbook',
  other: 'Other',
};

type FormState = {
  title: string;
  description: string;
  sourceType: SourceType;
  sourcePersonName: string;
  sourceName: string;
  sourceUrl: string;
  sourceNote: string;
  servings: string;
  yieldLabel: string;
  prepMinutes: string;
  cookMinutes: string;
  totalMinutes: string;
  photoUrl: string | null;
  tags: string;
  ingredients: string;
  steps: string;
  weights: Record<string, string>; // keyed by the ingredient line's text
};

const EMPTY: FormState = {
  title: '',
  description: '',
  sourceType: 'person',
  sourcePersonName: '',
  sourceName: '',
  sourceUrl: '',
  sourceNote: '',
  servings: '4',
  yieldLabel: 'servings',
  prepMinutes: '',
  cookMinutes: '',
  totalMinutes: '',
  photoUrl: null,
  tags: '',
  ingredients: '',
  steps: '',
  weights: {},
};

function fromRecipe(r: RecipeDetail): FormState {
  const weights: Record<string, string> = {};
  for (const i of r.ingredients) if (i.weightGrams != null) weights[i.rawText] = String(i.weightGrams);
  const n = (v: number | null) => (v == null ? '' : String(v));
  return {
    title: r.title,
    description: r.description ?? '',
    sourceType: r.sourceType,
    sourcePersonName: r.sourcePerson ?? '',
    sourceName: r.sourceName ?? '',
    sourceUrl: r.sourceUrl ?? '',
    sourceNote: r.sourceNote ?? '',
    servings: n(r.servings),
    yieldLabel: r.yieldLabel ?? '',
    prepMinutes: n(r.prepMinutes),
    cookMinutes: n(r.cookMinutes),
    totalMinutes: n(r.totalMinutes),
    photoUrl: r.photoUrl,
    tags: r.tags.join(', '),
    ingredients: ingredientsToText(r.ingredients),
    steps: r.steps.map((s) => s.text).join('\n'),
    weights,
  };
}

/** /recipes/new and /recipes/:slug/edit */
export function EditRecipePage({ slug }: { slug?: string }) {
  const { user, ready } = useAuth();
  const existing = useApi<RecipeDetail>(slug ? `/api/recipes/${encodeURIComponent(slug)}` : null);

  if (!ready) return null;
  if (!user) {
    return (
      <main className="narrow auth">
        <h1>Sign in to add recipes</h1>
        <p className="muted">Adding and editing recipes is for family who've been invited.</p>
        <Link to="/signin" className="button button-primary">
          Family sign-in
        </Link>
      </main>
    );
  }
  if (!slug) return <RecipeForm initial={EMPTY} defaultPerson={user.name} />;

  if (existing.status === 'not-found') return <NotFoundPage what="recipe" />;
  if (existing.status === 'error') return <main className="narrow"><p className="notice notice-warn">{existing.message}</p></main>;
  if (existing.status !== 'ok') return <main className="narrow"><p className="muted">Loading…</p></main>;

  const recipe = existing.data;
  if (!canEditRecipe(user, recipe.addedBy?.id ?? null)) {
    return (
      <main className="narrow auth">
        <h1>You can't edit this one</h1>
        <p className="muted">Only the person who added it, or someone who can edit anything, can change it.</p>
        <Link to={`/recipes/${encodeURIComponent(recipe.slug)}`} className="button">
          Back to the recipe
        </Link>
      </main>
    );
  }
  return <RecipeForm key={recipe.slug} initial={fromRecipe(recipe)} slug={recipe.slug} defaultPerson={user.name} />;
}

function RecipeForm({ initial, slug, defaultPerson }: { initial: FormState; slug?: string; defaultPerson: string }) {
  const { navigate } = useRouter();
  const [f, setF] = useState<FormState>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const names = useApi<{ names: string[] }>('/api/people/names');
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const parsed = useMemo(() => parseIngredientText(f.ingredients), [f.ingredients]);
  const steps = useMemo(() => parseStepText(f.steps), [f.steps]);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoState({ busy: true, error: null });
    try {
      const url = await uploadPhoto(await resizePhoto(file));
      set('photoUrl', url);
      setPhotoState({ busy: false, error: null });
    } catch (err) {
      setPhotoState({ busy: false, error: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const fillSiteName = () => {
    if (f.sourceName.trim() || !f.sourceUrl.trim()) return;
    try {
      const host = new URL(/^https?:\/\//i.test(f.sourceUrl) ? f.sourceUrl : `https://${f.sourceUrl}`).hostname.replace(/^www\./, '');
      if (f.sourceType === 'website') set('sourceName', host);
    } catch {
      // not a URL yet
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const body: RecipeInput = {
      title: f.title,
      description: f.description || null,
      sourceType: f.sourceType,
      sourcePersonName: f.sourceType === 'original' ? f.sourcePersonName || defaultPerson : f.sourcePersonName || null,
      sourceName: f.sourceName || null,
      sourceUrl: f.sourceUrl || null,
      sourceNote: f.sourceNote || null,
      servings: f.servings === '' ? null : Number(f.servings),
      yieldLabel: f.yieldLabel || null,
      prepMinutes: f.prepMinutes === '' ? null : Number(f.prepMinutes),
      cookMinutes: f.cookMinutes === '' ? null : Number(f.cookMinutes),
      totalMinutes: f.totalMinutes === '' ? null : Number(f.totalMinutes),
      photoUrl: f.photoUrl,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      ingredients: parsed.lines.map((l) => ({
        groupLabel: l.groupLabel,
        rawText: l.rawText,
        quantity: l.quantity,
        quantityMax: l.quantityMax,
        unit: l.unit,
        item: l.item,
        note: l.note,
        weightGrams: f.weights[l.rawText] ? Number(f.weights[l.rawText]) : null,
      })),
      steps,
    };

    setSaving(true);
    const result = slug
      ? await send<{ slug: string }>(`/api/recipes/${encodeURIComponent(slug)}`, 'PUT', body)
      : await send<{ slug: string }>('/api/recipes', 'POST', body);
    setSaving(false);

    if (result.ok) {
      setDirty(false);
      navigate(`/recipes/${encodeURIComponent(result.data.slug)}`);
      return;
    }
    setFormError(result.error);
    if (result.fields) setErrors(result.fields);
  };

  const remove = async () => {
    if (!slug || !window.confirm(`Delete "${f.title}"? This can't be undone.`)) return;
    const r = await send(`/api/recipes/${encodeURIComponent(slug)}`, 'DELETE');
    if (r.ok) {
      setDirty(false);
      navigate('/');
    } else setFormError(r.error);
  };

  const personNames = names.status === 'ok' ? names.data.names : [];

  return (
    <main className="editor">
      <form onSubmit={submit} noValidate>
        <header className="editor-head">
          <div>
            <p className="eyebrow">{slug ? 'EDIT RECIPE' : 'ADD A RECIPE'}</p>
            <h1>{f.title || (slug ? 'Untitled recipe' : 'New recipe')}</h1>
          </div>
          <div className="editor-actions">
            <Link to={slug ? `/recipes/${encodeURIComponent(slug)}` : '/'} className="button">
              Cancel
            </Link>
            <button type="submit" className="button button-primary" disabled={saving || photoState.busy}>
              {saving ? (slug ? 'Updating…' : 'Saving…') : slug ? 'Update' : 'Save'}
            </button>
          </div>
        </header>

        {formError && (
          <p className="notice notice-warn" role="alert">
            {formError}
          </p>
        )}

        <div className="editor-grid">
          <section className="editor-main">
            <Field label="Name" error={errors.title}>
              <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Mom's Lemon Bars" maxLength={120} required />
            </Field>

            <fieldset className="field">
              <legend className="label">Where it came from</legend>
              <div className="segmented wrap">
                {SOURCE_TYPES.map((t) => (
                  <button key={t} type="button" aria-pressed={f.sourceType === t} onClick={() => set('sourceType', t)}>
                    {SOURCE_CHOICES[t]}
                  </button>
                ))}
              </div>
              {errors.sourceType && <span className="field-error">{errors.sourceType}</span>}
            </fieldset>

            <SourceFields f={f} set={set} errors={errors} personNames={personNames} defaultPerson={defaultPerson} onUrlBlur={fillSiteName} />

            <Field label="Ingredients" hint='One per line. A line ending in ":" starts a group, e.g. "For the crust:".' error={errors.ingredients}>
              <textarea
                rows={10}
                value={f.ingredients}
                onChange={(e) => set('ingredients', e.target.value)}
                placeholder={'For the crust:\n2 cups all-purpose flour\n1/2 cup powdered sugar\n1 cup butter, softened'}
              />
            </Field>

            {parsed.lines.length > 0 && <IngredientPreview lines={parsed.lines} weights={f.weights} onWeight={(raw, g) => set('weights', { ...f.weights, [raw]: g })} />}

            <Field label="Steps" hint="One step per line. Times like “20 minutes” become timers." error={errors.steps}>
              <textarea
                rows={8}
                value={f.steps}
                onChange={(e) => set('steps', e.target.value)}
                placeholder={'Heat the oven to 350°F.\nPress the crust into the pan and bake 20 minutes.'}
              />
            </Field>

            {steps.length > 0 && (
              <ol className="steps-preview small">
                {steps.map((s, i) => (
                  <li key={i}>
                    {s.text}
                    {s.timerSeconds ? <span className="timer mono"> TIMER {formatTimer(s.timerSeconds)}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="editor-side">
            <div className="field">
              <span className="label">Photo</span>
              <div className="photo-slot" style={f.photoUrl ? { backgroundImage: `url(${JSON.stringify(f.photoUrl)})` } : undefined}>
                {!f.photoUrl && <span className="muted small">{photoState.busy ? 'Uploading…' : 'No photo yet'}</span>}
              </div>
              <div className="row">
                <input ref={fileInput} type="file" accept="image/*" className="visually-hidden" id="photo" onChange={(e) => choosePhoto(e.target.files?.[0])} />
                <label htmlFor="photo" className="button">
                  {f.photoUrl ? 'Replace photo' : 'Add a photo'}
                </label>
                {f.photoUrl && (
                  <button type="button" className="text-button" onClick={() => set('photoUrl', null)}>
                    Remove
                  </button>
                )}
              </div>
              {(photoState.error || errors.photoUrl) && <span className="field-error">{photoState.error ?? errors.photoUrl}</span>}
            </div>

            <div className="row">
              <Field label="Makes" error={errors.servings}>
                <input inputMode="decimal" value={f.servings} onChange={(e) => set('servings', e.target.value)} />
              </Field>
              <Field label="Of what">
                <input value={f.yieldLabel} onChange={(e) => set('yieldLabel', e.target.value)} placeholder="servings, bars…" />
              </Field>
            </div>

            <div className="row">
              <Field label="Prep (min)" error={errors.prepMinutes}>
                <input inputMode="numeric" value={f.prepMinutes} onChange={(e) => set('prepMinutes', e.target.value)} />
              </Field>
              <Field label="Cook (min)" error={errors.cookMinutes}>
                <input inputMode="numeric" value={f.cookMinutes} onChange={(e) => set('cookMinutes', e.target.value)} />
              </Field>
              <Field label="Total (min)" error={errors.totalMinutes}>
                <input inputMode="numeric" value={f.totalMinutes} onChange={(e) => set('totalMinutes', e.target.value)} />
              </Field>
            </div>

            <Field label="Tags" hint="Comma-separated: dessert, weeknight, vegetarian">
              <input value={f.tags} onChange={(e) => set('tags', e.target.value)} />
            </Field>

            <Field label="Description (optional)">
              <textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
            </Field>

            {slug && (
              <button type="button" className="text-button danger" onClick={remove}>
                Delete this recipe
              </button>
            )}
          </aside>
        </div>
      </form>
    </main>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="small muted">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function SourceFields({
  f,
  set,
  errors,
  personNames,
  defaultPerson,
  onUrlBlur,
}: {
  f: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Record<string, string>;
  personNames: string[];
  defaultPerson: string;
  onUrlBlur: () => void;
}) {
  const url = (placeholder: string) => (
    <Field label="Link" error={errors.sourceUrl}>
      <input type="url" inputMode="url" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} onBlur={onUrlBlur} placeholder={placeholder} />
    </Field>
  );
  const note = (placeholder: string) => (
    <Field label="Note (optional)">
      <input value={f.sourceNote} onChange={(e) => set('sourceNote', e.target.value)} placeholder={placeholder} />
    </Field>
  );

  switch (f.sourceType) {
    case 'person':
      return (
        <div className="row">
          <Field label="Who" error={errors.sourcePersonName}>
            <input list="people-names" value={f.sourcePersonName} onChange={(e) => set('sourcePersonName', e.target.value)} placeholder="Mom, Grandpa Lou…" />
            <datalist id="people-names">
              {personNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          {note('from a church cookbook, 1987')}
        </div>
      );
    case 'original':
      return (
        <div className="row">
          <Field label="Whose original">
            <input list="people-names" value={f.sourcePersonName} onChange={(e) => set('sourcePersonName', e.target.value)} placeholder={defaultPerson} />
            <datalist id="people-names">
              {personNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          {note('riff on a restaurant dish')}
        </div>
      );
    case 'website':
      return (
        <div className="row">
          {url('https://…')}
          <Field label="Site name">
            <input value={f.sourceName} onChange={(e) => set('sourceName', e.target.value)} placeholder="filled from the link" />
          </Field>
        </div>
      );
    case 'social':
      return (
        <div className="row">
          <Field label="Account">
            <input value={f.sourceName} onChange={(e) => set('sourceName', e.target.value)} placeholder="@someone" />
          </Field>
          {url('Link to the post')}
        </div>
      );
    case 'cookbook':
      return (
        <div className="row">
          <Field label="Book">
            <input value={f.sourceName} onChange={(e) => set('sourceName', e.target.value)} placeholder="Title (and author)" />
          </Field>
          {note('page 112')}
        </div>
      );
    default:
      return (
        <div className="row">
          <Field label="Source">
            <input value={f.sourceName} onChange={(e) => set('sourceName', e.target.value)} placeholder="a magazine, a restaurant…" />
          </Field>
          {note('')}
        </div>
      );
  }
}

function IngredientPreview({
  lines,
  weights,
  onWeight,
}: {
  lines: ReturnType<typeof parseIngredientText>['lines'];
  weights: Record<string, string>;
  onWeight: (rawText: string, grams: string) => void;
}) {
  const unread = lines.filter((l) => l.quantity == null).length;
  return (
    <div className="parse-preview">
      <p className="small muted">
        How we read it{unread ? ` · ${unread} line${unread === 1 ? '' : 's'} kept as written (no amount found)` : ''}. Add exact grams if you
        weigh it; Grams mode will use them.
      </p>
      <table>
        <thead>
          <tr>
            <th>Amount</th>
            <th>Ingredient</th>
            <th>Note</th>
            <th>Exact g</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={l.quantity == null ? 'unparsed' : undefined}>
              <td className="mono">
                {l.quantity != null
                  ? `${formatQuantity(l.quantity)}${l.quantityMax != null ? `–${formatQuantity(l.quantityMax)}` : ''}${l.unit ? ` ${l.unit}` : ''}`
                  : '—'}
              </td>
              <td>
                {l.groupLabel && <span className="small muted">{l.groupLabel} · </span>}
                {l.item ?? l.rawText}
              </td>
              <td className="muted">{l.note ?? ''}</td>
              <td>
                <input
                  className="grams"
                  inputMode="decimal"
                  aria-label={`Exact grams for ${l.rawText}`}
                  value={weights[l.rawText] ?? ''}
                  onChange={(e) => onWeight(l.rawText, e.target.value.replace(/[^\d.]/g, ''))}
                  disabled={l.quantity == null}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
