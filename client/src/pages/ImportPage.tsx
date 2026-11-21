import { useEffect, useRef, useState, type FormEvent } from 'react';
import { draftFromText, emptyDraft, parseLink, sourceFromLink, type ImportResult, type RecipeDraft } from '../../../shared/importText';
import { send } from '../api';
import { useAuth } from '../auth';
import { Link, useRouter } from '../router';
import { EMPTY, RecipeForm, type FormState } from './EditRecipePage';

type Mode = 'link' | 'paste';

function toForm(d: RecipeDraft): FormState {
  const n = (v: number | null) => (v == null ? '' : String(v));
  return {
    ...EMPTY,
    title: d.title,
    description: d.description,
    sourceType: d.sourceType,
    sourceName: d.sourceName,
    sourceUrl: d.sourceUrl,
    sourceNote: d.sourceNote,
    servings: n(d.servings) || EMPTY.servings,
    yieldLabel: d.yieldLabel ?? EMPTY.yieldLabel,
    prepMinutes: n(d.prepMinutes),
    cookMinutes: n(d.cookMinutes),
    totalMinutes: n(d.totalMinutes),
    tags: d.tags.join(', '),
    ingredients: d.ingredients.join('\n'),
    steps: d.steps.join('\n'),
  };
}

/** /import: from a link (read on the server) or pasted text (read right here). */
export function ImportPage() {
  const { user, ready } = useAuth();
  const { search } = useRouter();
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState(search.get('url') ?? '');
  const [pasted, setPasted] = useState(search.get('text') ?? '');
  const [pasteLink, setPasteLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(ImportResult & { key: number }) | null>(null);
  const autoRan = useRef(false);

  const importLink = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!parseLink(url)) {
      setError('Paste a full web link, like https://…');
      return;
    }
    setBusy(true);
    const r = await send<ImportResult>('/api/import/url', 'POST', { url });
    setBusy(false);
    if (r.ok) setResult({ ...r.data, key: Date.now() });
    else setError(r.error);
  };

  const readPasted = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pasted.trim()) {
      setError('Paste the recipe text first.');
      return;
    }
    const link = parseLink(pasteLink);
    const base: RecipeDraft = link ? { ...emptyDraft(), ...sourceFromLink(link) } : emptyDraft();
    const draft = draftFromText(pasted, base);
    const notes: string[] = [];
    if (!draft.ingredients.length) notes.push("We couldn't tell which lines are ingredients. Put them in the Ingredients box, one per line.");
    else if (!draft.steps.length) notes.push("We couldn't find the steps. Put them in the Steps box, one per line.");
    setResult({ draft, found: draft.ingredients.length ? 'text' : 'little', notes, duplicate: null, key: Date.now() });
  };

  // /import?url=… (from a bookmark or, later, the phone's share sheet) starts right away.
  useEffect(() => {
    if (!ready || !user || autoRan.current || !search.get('url')) return;
    autoRan.current = true;
    void importLink();
  }, [ready, user]);

  if (!ready) return null;
  if (!user) {
    return (
      <main className="narrow auth">
        <h1>Sign in to import recipes</h1>
        <p className="muted">Importing is for family who've been invited.</p>
        <Link to="/signin" className="button button-primary">
          Family sign-in
        </Link>
      </main>
    );
  }

  if (result) {
    const { draft, found, notes, duplicate } = result;
    const counts = `${draft.ingredients.length} ingredient${draft.ingredients.length === 1 ? '' : 's'}, ${draft.steps.length} step${draft.steps.length === 1 ? '' : 's'}`;
    return (
      <RecipeForm
        key={result.key}
        initial={toForm(draft)}
        importedPhoto={draft.imageUrl}
        defaultPerson={user.name}
        eyebrow="IMPORTED · CHECK IT OVER"
        startDirty
        cancel={{ label: 'Start over', onClick: () => window.confirm('Throw away this import and start over?') && setResult(null) }}
        banner={
          <div className="import-banner">
            {duplicate && (
              <p className="notice notice-warn">
                This link is already in the box as{' '}
                <Link to={`/recipes/${encodeURIComponent(duplicate.slug)}`}>{duplicate.title}</Link>. Saving makes a second copy.
              </p>
            )}
            <p className={`import-summary ${found}`}>
              <span className="mono small">{found === 'recipe' ? 'READ FROM RECIPE DATA' : found === 'text' ? 'READ FROM TEXT' : 'NOT MUCH FOUND'}</span>{' '}
              {found === 'little' ? 'Fill in what’s missing below.' : `${counts}. Check the preview tables before saving.`}
            </p>
            {notes.map((n) => (
              <p key={n} className="notice notice-warn">
                {n}
              </p>
            ))}
          </div>
        }
      />
    );
  }

  return (
    <main className="importer">
      <p className="eyebrow">IMPORT A RECIPE</p>
      <h1>Bring a recipe into the box</h1>
      <p className="muted">Nothing is saved until you've checked it over.</p>

      <div className="segmented import-tabs" role="tablist" aria-label="Import from">
        <button type="button" role="tab" aria-selected={mode === 'link'} aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setError(null); }}>
          From a link
        </button>
        <button type="button" role="tab" aria-selected={mode === 'paste'} aria-pressed={mode === 'paste'} onClick={() => { setMode('paste'); setError(null); }}>
          Paste text
        </button>
      </div>

      {mode === 'link' ? (
        <form className="import-card" onSubmit={importLink} noValidate>
          <label className="field">
            <span className="label">Recipe link</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com/lemon-bars"
            />
            <span className="small muted">Recipe websites work best. Instagram, TikTok and YouTube work when the post shares its caption.</span>
          </label>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Reading the page…' : 'Import'}
          </button>
        </form>
      ) : (
        <form className="import-card" onSubmit={readPasted} noValidate>
          <label className="field">
            <span className="label">Recipe text</span>
            <textarea
              rows={12}
              autoFocus
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'Paste a caption, an email, or a recipe copied from a page.\n\nIt helps if it has "Ingredients" and "Instructions" headings.'}
            />
          </label>
          <label className="field">
            <span className="label">Where it came from (optional link)</span>
            <input type="url" inputMode="url" autoComplete="off" value={pasteLink} onChange={(e) => setPasteLink(e.target.value)} placeholder="https://www.instagram.com/p/…" />
          </label>
          <button type="submit" className="button button-primary">
            Read it
          </button>
        </form>
      )}

      {error && (
        <p className="notice notice-warn" role="alert">
          {error}
        </p>
      )}

      <p className="small muted import-alt">
        Typing one in from a card? <Link to="/recipes/new">Add it by hand</Link>.
      </p>
    </main>
  );
}
