import { useMemo, useState, type FormEvent } from 'react';
import { buildRows, entryFromText, listAsText, SECTIONS, type ShoppingRow } from '../../../shared/shopping';
import { useUnitSystem } from '../ingredients';
import { Link } from '../router';
import { shopping, useShoppingEntries } from '../shoppingList';

/** /shopping: one list for this device, merged across recipes and sorted by aisle. */
export function ShoppingPage() {
  const entries = useShoppingEntries();
  const [system, chooseSystem] = useUnitSystem();
  const [text, setText] = useState('');
  const [shared, setShared] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(entries, system), [entries, system]);
  const recipes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) if (e.recipe) seen.set(e.recipe.slug, e.recipe.title);
    return [...seen];
  }, [entries]);
  const left = rows.filter((r) => !r.checked).length;
  const ticked = rows.length - left;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const items = text
      .split(/[\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!items.length) return;
    shopping.add(items.map((t) => entryFromText(t)));
    setText('');
  };

  const share = async () => {
    const body = listAsText(rows);
    if (!body) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Shopping list', text: body });
        return;
      }
      await navigator.clipboard.writeText(body);
      setShared('Copied. Paste it into a message or your notes.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // closed the share sheet
      setShared("Couldn't copy here. Select the list and copy it instead.");
    }
    window.setTimeout(() => setShared(null), 4000);
  };

  return (
    <main className="shopping">
      <header className="shopping-head">
        <div>
          <p className="eyebrow">SHOPPING LIST</p>
          <h1>{rows.length ? `${left} to get` : 'Nothing on the list'}</h1>
          <p className="muted small">Kept on this device only. Add recipes from their page, or type things in.</p>
        </div>
        <div className="toggle mono" role="group" aria-label="Units">
          {(['us', 'metric', 'grams'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={system === s} onClick={() => chooseSystem(s)}>
              {s === 'us' ? 'US' : s.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <form className="shopping-add" onSubmit={add}>
        <label className="visually-hidden" htmlFor="shopping-add">
          Add items
        </label>
        <input id="shopping-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="2 lemons, paper towels…" autoComplete="off" enterKeyHint="done" />
        <button type="submit" className="button button-primary">
          Add
        </button>
      </form>

      {recipes.length > 0 && (
        <div className="shopping-recipes">
          <span className="small muted">For</span>
          {recipes.map(([slug, title]) => (
            <span key={slug} className="token">
              <Link to={`/recipes/${encodeURIComponent(slug)}`}>{title}</Link>
              <button type="button" aria-label={`Take ${title} off the list`} onClick={() => shopping.removeRecipe(slug)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="notice">
          Open a recipe and choose <strong>Add to shopping list</strong>. The same ingredient from different recipes is added
          together.
        </p>
      ) : (
        <>
          {SECTIONS.map((section) => {
            const items = rows.filter((r) => r.section === section);
            if (!items.length) return null;
            return (
              <section key={section} className="shopping-section">
                <h2 className="label">{section}</h2>
                <ul className="checklist checklist-large">
                  {items.map((r) => (
                    <Row key={r.key} row={r} />
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="shopping-actions">
            <button type="button" className="button" onClick={share}>
              Share list
            </button>
            <button type="button" className="button" onClick={() => window.print()}>
              Print
            </button>
            {ticked > 0 && (
              <button type="button" className="button" onClick={() => shopping.clearChecked()}>
                Clear {ticked} ticked
              </button>
            )}
            <button type="button" className="text-button" onClick={() => window.confirm('Clear the whole list?') && shopping.clearAll()}>
              Clear everything
            </button>
          </div>
          {shared && (
            <p className="small muted" role="status">
              {shared}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Row({ row }: { row: ShoppingRow }) {
  const ids = row.entries.map((e) => e.id);
  return (
    <li className="shopping-row">
      <label className={row.checked ? 'is-done' : undefined}>
        <input type="checkbox" checked={row.checked} onChange={() => shopping.setChecked(ids, !row.checked)} />
        <span>
          {row.amount && <strong className={row.approx ? 'estimate-text' : undefined}>{row.amount} </strong>}
          {row.name}
          {row.recipes.length > 0 && <span className="shopping-for small muted">{row.recipes.join(' · ')}</span>}
        </span>
      </label>
      <button type="button" className="row-remove" aria-label={`Remove ${row.name}`} onClick={() => shopping.remove(ids)}>
        ×
      </button>
    </li>
  );
}
