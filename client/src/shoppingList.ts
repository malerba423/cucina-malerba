import { useSyncExternalStore } from 'react';
import type { ShoppingEntry } from '../../shared/shopping';

// The shopping list lives in this browser's localStorage only. One small store
// keeps every component (header count, list page, recipe page) in step, and
// the 'storage' event keeps other open tabs in step too.

const KEY = 'cucina.shopping.v1';
const listeners = new Set<() => void>();
let entries: ShoppingEntry[] = read();

function read(): ShoppingEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ShoppingEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string' && typeof e.rawText === 'string') : [];
  } catch {
    return [];
  }
}

function write(next: ShoppingEntry[]) {
  entries = next.slice(0, 500);
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage full or blocked: still works until the page closes
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    entries = read();
    listeners.forEach((l) => l());
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useShoppingEntries(): ShoppingEntry[] {
  return useSyncExternalStore(subscribe, () => entries, () => entries);
}

export const shopping = {
  add(list: ShoppingEntry[]) {
    write([...entries, ...list]);
  },
  setChecked(ids: string[], checked: boolean) {
    const set = new Set(ids);
    write(entries.map((e) => (set.has(e.id) ? { ...e, checked } : e)));
  },
  remove(ids: string[]) {
    const set = new Set(ids);
    write(entries.filter((e) => !set.has(e.id)));
  },
  removeRecipe(slug: string) {
    write(entries.filter((e) => e.recipe?.slug !== slug));
  },
  clearChecked() {
    write(entries.filter((e) => !e.checked));
  },
  clearAll() {
    write([]);
  },
};
