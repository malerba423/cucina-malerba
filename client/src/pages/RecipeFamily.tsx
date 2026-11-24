import { useEffect, useRef, useState, type FormEvent } from 'react';
import { hasRole, type Me } from '../../../shared/auth';
import type { CollectionListResponse, RecipeDetail, RecipeNote } from '../../../shared/types';
import { send, useApi } from '../api';
import { longDate } from '../format';
import { Link } from '../router';
import { Linkified } from '../Linkified';

// The family-notebook parts of a recipe page: "made it" logs, notes and
// collections. Everyone sees them; signed-in family can add to them.

const mayChange = (me: Me | null, authorId: number | null) => !!me && (hasRole(me.role, 'editor') || (authorId != null && authorId === me.id));

/** Today as YYYY-MM-DD in the cook's own time zone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- made it ----------

export function MadeItSection({ recipe, me, startOpen, onChanged }: { recipe: RecipeDetail; me: Me | null; startOpen: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(startOpen && !!me);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (startOpen && me) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [startOpen, me]);

  if (!me && recipe.cookLogs.length === 0) return null;

  const remove = async (id: number) => {
    if (!window.confirm('Remove this entry?')) return;
    await send(`/api/made/${id}`, 'DELETE');
    onChanged();
  };

  return (
    <section className="made-log" id="made-it" ref={ref}>
      <div className="section-head">
        <h2>
          Made it{recipe.madeCount ? ` · ${recipe.madeCount} ${recipe.madeCount === 1 ? 'time' : 'times'}` : ''}
          {recipe.avgRating != null && <span className="muted small"> · ★ {recipe.avgRating}</span>}
        </h2>
        {me && !open && (
          <button type="button" className="button button-small no-print" onClick={() => setOpen(true)}>
            I made this
          </button>
        )}
      </div>

      {open && me && (
        <MadeItForm
          slug={recipe.slug}
          onDone={(saved) => {
            setOpen(false);
            if (saved) onChanged();
          }}
        />
      )}

      {recipe.cookLogs.length > 0 ? (
        <div className="log-grid">
          {recipe.cookLogs.map((log) => (
            <div key={log.id} className="log-entry">
              <p className="mono small muted">
                {longDate(log.cookedOn).toUpperCase()}
                {log.person ? ` · ${log.person.toUpperCase()}` : ''}
                {log.rating ? <span className="stars"> {'★'.repeat(log.rating)}</span> : null}
              </p>
              {log.note && (
                <p>
                  <Linkified text={log.note} />
                </p>
              )}
              {mayChange(me, log.userId) && (
                <button type="button" className="text-button small no-print" onClick={() => remove(log.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        !open && <p className="small muted">Nobody has logged this one yet.</p>
      )}
    </section>
  );
}

function MadeItForm({ slug, onDone }: { slug: string; onDone: (saved: boolean) => void }) {
  const [cookedOn, setCookedOn] = useState(today());
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await send(`/api/recipes/${encodeURIComponent(slug)}/made`, 'POST', { cookedOn, rating, note });
    setBusy(false);
    if (r.ok) onDone(true);
    else setError(r.error);
  };

  return (
    <form className="made-form" onSubmit={submit}>
      <label className="field">
        <span className="label">When</span>
        <input type="date" value={cookedOn} max={today()} onChange={(e) => setCookedOn(e.target.value)} required />
      </label>
      <fieldset className="field star-field">
        <legend className="label">How was it? (optional)</legend>
        <div className="star-picker" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              className={rating != null && n <= rating ? 'on' : undefined}
              onClick={() => setRating(rating === n ? null : n)}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field made-note">
        <span className="label">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Less salt next time; doubled the garlic…" maxLength={1000} />
      </label>
      <div className="row">
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Log it'}
        </button>
        <button type="button" className="text-button" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------- notes ----------

export function NotesSection({ recipe, me, onChanged }: { recipe: RecipeDetail; me: Me | null; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me && recipe.notes.length === 0) return null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const r = await send(`/api/recipes/${encodeURIComponent(recipe.slug)}/notes`, 'POST', { text });
    setBusy(false);
    if (r.ok) {
      setText('');
      setError(null);
      onChanged();
    } else setError(r.error);
  };

  return (
    <section className="notes">
      <h2>Notes &amp; tweaks</h2>
      {recipe.notes.length === 0 && <p className="small muted">Changes you make, tips, what to watch for. The recipe itself stays as written.</p>}
      <ul className="note-list">
        {recipe.notes.map((n) => (
          <NoteItem key={n.id} note={n} canChange={mayChange(me, n.userId)} onChanged={onChanged} />
        ))}
      </ul>
      {me && (
        <form className="note-form no-print" onSubmit={add}>
          <label className="visually-hidden" htmlFor="new-note">
            Add a note
          </label>
          <textarea id="new-note" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="I use brown butter and cut the sugar to ¾ cup…" maxLength={2000} />
          <button type="submit" className="button button-small" disabled={busy || !text.trim()}>
            {busy ? 'Adding…' : 'Add note'}
          </button>
          {error && <span className="field-error">{error}</span>}
        </form>
      )}
    </section>
  );
}

function NoteItem({ note, canChange, onChanged }: { note: RecipeNote; canChange: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await send(`/api/notes/${note.id}`, 'PUT', { text });
    if (r.ok) {
      setEditing(false);
      onChanged();
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this note?')) return;
    await send(`/api/notes/${note.id}`, 'DELETE');
    onChanged();
  };

  return (
    <li className="note">
      {editing ? (
        <form onSubmit={save} className="note-form">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <div className="row">
            <button type="submit" className="button button-small">
              Save
            </button>
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="note-text">
            <Linkified text={note.text} />
          </p>
          <p className="small muted">
            {note.author ?? 'Someone'} · {longDate(note.createdAt)}
            {note.updatedAt !== note.createdAt ? ' (edited)' : ''}
            {canChange && (
              <span className="no-print">
                {' '}
                ·{' '}
                <button type="button" className="text-button" onClick={() => setEditing(true)}>
                  Edit
                </button>{' '}
                ·{' '}
                <button type="button" className="text-button" onClick={remove}>
                  Delete
                </button>
              </span>
            )}
          </p>
        </>
      )}
    </li>
  );
}

// ---------- collections ----------

/** Chips for the collections a recipe is in, and (for family) a picker to change them. */
export function CollectionsPicker({ recipe, me, onChanged }: { recipe: RecipeDetail; me: Me | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const all = useApi<CollectionListResponse>(open ? `/api/collections?v=${version}` : null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inIt = new Set(recipe.collections.map((c) => c.slug));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = async (slug: string) => {
    const path = `/api/collections/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(recipe.slug)}`;
    const r = await send(path, inIt.has(slug) ? 'DELETE' : 'PUT');
    if (!r.ok) setError(r.error);
    onChanged();
    setVersion((v) => v + 1);
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await send('/api/collections', 'POST', { name, recipeSlug: recipe.slug });
    if (r.ok) {
      setName('');
      setError(null);
      onChanged();
      setVersion((v) => v + 1);
    } else setError(r.error);
  };

  if (!me && recipe.collections.length === 0) return null;

  return (
    <div className="collections-line" ref={ref}>
      {recipe.collections.map((c) => (
        <Link key={c.slug} to={`/collections/${encodeURIComponent(c.slug)}`} className="chip">
          {c.name}
        </Link>
      ))}
      {me && (
        <button type="button" className="chip chip-add no-print" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {recipe.collections.length ? 'Collections…' : '+ Add to a collection'}
        </button>
      )}
      {open && (
        <div className="collection-menu" role="dialog" aria-label="Collections">
          {all.status === 'ok' ? (
            all.data.collections.length ? (
              <ul>
                {all.data.collections.map((c) => (
                  <li key={c.slug}>
                    <label className="check">
                      <input type="checkbox" checked={inIt.has(c.slug)} onChange={() => toggle(c.slug)} />
                      <span>
                        {c.name} <span className="muted small">{c.recipeCount}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No collections yet. Start one:</p>
            )
          ) : (
            <p className="small muted">Loading…</p>
          )}
          <form className="row" onSubmit={create}>
            <label className="field">
              <span className="visually-hidden">New collection name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection…" maxLength={80} />
            </label>
            <button type="submit" className="button button-small" disabled={!name.trim()}>
              Add
            </button>
          </form>
          {error && <p className="field-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
