import { useState } from 'react';
import type { IngredientLine } from '../../shared/types';
import { presentIngredient, UNIT_SYSTEMS, type UnitSystem } from '../../shared/units';

// Ingredient display shared by the recipe page and cook mode.

/** US / metric / grams, remembered on this device. */
export function useUnitSystem(): [UnitSystem, (s: UnitSystem) => void] {
  const [system, setSystem] = useState<UnitSystem>(() => {
    try {
      const saved = localStorage.getItem('units');
      return UNIT_SYSTEMS.includes(saved as UnitSystem) ? (saved as UnitSystem) : 'us';
    } catch {
      return 'us';
    }
  });
  const choose = (s: UnitSystem) => {
    setSystem(s);
    try {
      localStorage.setItem('units', s);
    } catch {
      // storage blocked: the choice just won't be remembered
    }
  };
  return [system, choose];
}

export function IngredientText({ line, factor, system }: { line: IngredientLine; factor: number; system: UnitSystem }) {
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

export function groupIngredients(lines: IngredientLine[]) {
  const groups: { label: string | null; lines: IngredientLine[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.label === line.groupLabel) last.lines.push(line);
    else groups.push({ label: line.groupLabel, lines: [line] });
  }
  return groups;
}

