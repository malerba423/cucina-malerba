import type { SourceType } from '../../shared/types';

// Placeholder "photo" colours until real photos arrive (milestone 4).
// Picked per recipe from its slug, so a card keeps its colour.
const TINTS = ['#F2C7A9', '#D98C78', '#E3C79A', '#E8B84E', '#F3E08A', '#B9CFA6', '#A9C59A', '#C9D6E8'];

export function tintFor(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export const KIND_LABEL: Record<SourceType, string> = {
  person: 'FAMILY',
  original: 'ORIGINAL',
  website: 'WEBSITE',
  social: 'SOCIAL',
  cookbook: 'COOKBOOK',
  other: 'OTHER',
};

/** "14 NOV" for cards, "Nov 14, 2026" for the recipe page. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
}

export function longDate(iso: string): string {
  // Date-only strings ("2026-11-14") are read as local dates, not UTC midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 1).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function stars(rating: number): string {
  return `★ ${Number.isInteger(rating) ? rating : rating.toFixed(1)}`;
}

/** "Mom" → "Mom’s", "Chris" → "Chris’". */
export function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}’` : `${n}’s`;
}

/** "Joel Malerba" → "Joel". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
