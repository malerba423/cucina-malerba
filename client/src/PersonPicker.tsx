import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

// A name box with the app's own suggestion list (not the browser's): everyone
// who has contributed recipes, narrowed as you type, plus "Use “…”" for a new
// name. Opens on click or focus in every browser; ↑/↓, Enter and Esc work.
export function PersonPicker({
  value,
  onChange,
  names,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  names: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const typed = value.trim();
  const options = useMemo(() => {
    const q = typed.toLowerCase();
    const matches = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
    // Names that start with what's typed first ("Ma" → Mary before Emma).
    const sorted = [...matches].sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)));
    const exact = names.some((n) => n.toLowerCase() === q);
    return [...sorted.map((n) => ({ name: n, isNew: false })), ...(typed && !exact ? [{ name: typed, isNew: true }] : [])];
  }, [names, typed]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (options.length ? (i + step + options.length) % options.length : 0));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault(); // don't submit the form while picking
      choose(options[active].name);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const showList = open && options.length > 0;

  return (
    <div className="person-picker">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="person-options" id={listId} role="listbox">
          {options.map((o, i) => (
            <li
              key={`${o.isNew ? 'new:' : ''}${o.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              // mousedown, not click: picking must happen before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o.name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.isNew ? (
                <>
                  Use “<strong>{o.name}</strong>”
                </>
              ) : (
                o.name
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
