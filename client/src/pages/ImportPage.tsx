import { useEffect, useRef, useState, type FormEvent } from 'react';
import { draftFromText, emptyDraft, parseLink, sourceFromLink, type ImportResult, type RecipeDraft } from '../../../shared/importText';
import { send } from '../api';
import { useAuth } from '../auth';
import { Link, useRouter } from '../router';
import { EMPTY, RecipeForm, type FormState } from './EditRecipePage';
import { ShareHelp } from './ShareHelp';

type Mode = 'link' | 'paste';

/**
 * What arrived from the phone's share sheet or a bookmarklet. Apps share
 * differently: some send ?url=, many put the link inside ?text= ("Check out
 * this reel! https://…"), and a few send only text.
 */
function fromShare(search: URLSearchParams): { url: string; text: string } {
  const url = search.get('url')?.trim() ?? '';
  const text = search.get('text')?.trim() ?? '';
  const title = search.get('title')?.trim() ?? '';
  if (/^https?:\/\/\S+$/i.test(url)) return { url, text: '' };
  // The link can arrive wrapped in words, even in ?url= (an iPhone Shortcut passes whatever was shared).
  const found = /https?:\/\/[^\s<>"']+/i.exec(`${url} ${text} ${title}`)?.[0]?.replace(/[).,!?]+$/, '') ?? '';
  if (found) return { url: found, text: '' };
  return { url: '', text: text || url };
}

/** Remembers where to come back to after signing in from the email link. */
export function rememberReturn(path: string) {
  try {
    localStorage.setItem('cucina.afterSignIn', JSON.stringify({ path, at: Date.now() }));
  } catch {
    // not remembered: they land on the home page instead
  }
}

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
  const shared = fromShare(search);
  const [mode, setMode] = useState<Mode>(shared.text && !shared.url ? 'paste' : 'link');
  const [url, setUrl] = useState(shared.url);
  const [pasted, setPasted] = useState(shared.text);
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

  // A shared link (share sheet, Shortcut or bookmarklet) starts right away.
  useEffect(() => {
    if (!ready || !user || autoRan.current || !shared.url) return;
    autoRan.current = true;
    void importLink();
  }, [ready, user]);

  if (!ready) return null;
  if (!user) {
    return (
      <main className="narrow auth">
        <h1>Sign in to import recipes</h1>
        <p className="muted">Importing is for family who've been invited.{shared.url ? ' The link you shared will be waiting after you sign in.' : ''}</p>
        <Link to="/signin" className="button button-primary" onClick={() => rememberReturn(`${window.location.pathname}${window.location.search}`)}>
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

      <ShareHelp />
    </main>
  );
}
