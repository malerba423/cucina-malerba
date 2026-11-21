import { describe, expect, it } from 'vitest';
import { densityFor, formatMinutes, formatQuantity, formatTimer, normalizeUnit, presentAmount, presentIngredient } from './units.js';

describe('formatQuantity', () => {
  it('uses fraction glyphs for common fractions', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.5)).toBe('1½');
    expect(formatQuantity(2 / 3)).toBe('⅔');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(2.75)).toBe('2¾');
    expect(formatQuantity(0.125)).toBe('⅛');
  });
  it('rounds near-whole numbers and falls back to one decimal', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(1.02)).toBe('1');
    expect(formatQuantity(1.98)).toBe('2');
    expect(formatQuantity(2.45)).toBe('2.5');
  });
});

describe('normalizeUnit', () => {
  it('maps aliases to canonical units', () => {
    expect(normalizeUnit('tablespoons')).toBe('tbsp');
    expect(normalizeUnit('T')).toBe('tbsp');
    expect(normalizeUnit('t')).toBe('tsp');
    expect(normalizeUnit('Cups')).toBe('cup');
    expect(normalizeUnit('lbs.')).toBe('lb');
  });
  it('returns null for counted units', () => {
    expect(normalizeUnit('clove')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe('presentAmount', () => {
  it('returns null when there is no parsed quantity', () => {
    expect(presentAmount(null, null, null, 1, 'us')).toBeNull();
  });
  it('scales within the same system', () => {
    expect(presentAmount(2, null, 'cup', 1.5, 'us')).toEqual({ amount: '3', unit: 'cups' });
    expect(presentAmount(0.5, null, 'cup', 1, 'us')).toEqual({ amount: '½', unit: 'cup' });
  });
  it('scales counted units and pluralizes them', () => {
    expect(presentAmount(6, null, 'clove', 0.5, 'us')).toEqual({ amount: '3', unit: 'cloves' });
    expect(presentAmount(1, null, 'bunch', 2, 'metric')).toEqual({ amount: '2', unit: 'bunches' });
    expect(presentAmount(4, null, null, 0.5, 'us')).toEqual({ amount: '2', unit: null });
  });
  it('converts US to metric with kitchen rounding', () => {
    expect(presentAmount(1, null, 'cup', 1, 'metric')).toEqual({ amount: '240', unit: 'ml' });
    expect(presentAmount(2, null, 'tbsp', 1, 'metric')).toEqual({ amount: '30', unit: 'ml' });
    expect(presentAmount(1, null, 'lb', 1, 'metric')).toEqual({ amount: '455', unit: 'g' });
    expect(presentAmount(8, null, 'oz', 1, 'metric')).toEqual({ amount: '225', unit: 'g' });
    expect(presentAmount(5, null, 'cup', 1, 'metric')).toEqual({ amount: '1.2', unit: 'l' });
  });
  it('converts metric to readable US units', () => {
    expect(presentAmount(250, null, 'ml', 1, 'us')).toEqual({ amount: '1', unit: 'cup' });
    expect(presentAmount(15, null, 'ml', 1, 'us')).toEqual({ amount: '1', unit: 'tbsp' });
    expect(presentAmount(500, null, 'g', 1, 'us')).toEqual({ amount: '1⅛', unit: 'lb' });
  });
  it('keeps ranges', () => {
    expect(presentAmount(2, 3, 'tbsp', 1, 'us')).toEqual({ amount: '2–3', unit: 'tbsp' });
  });
});

describe('grams mode', () => {
  const line = (quantity: number | null, unit: string | null, item: string, weightGrams: number | null = null) => ({
    quantity,
    quantityMax: null,
    unit,
    item,
    weightGrams,
  });

  it('weighs volumes using typical densities, marked approximate', () => {
    expect(presentIngredient(line(2, 'cup', 'all-purpose flour'), 1, 'grams')).toEqual({ amount: '240', unit: 'g', approx: true });
    expect(presentIngredient(line(1.5, 'cup', 'sugar'), 1, 'grams')).toEqual({ amount: '300', unit: 'g', approx: true });
    expect(presentIngredient(line(0.5, 'cup', 'powdered sugar'), 1, 'grams')).toEqual({ amount: '57', unit: 'g', approx: true });
    expect(presentIngredient(line(1, 'tsp', 'baking soda'), 1, 'grams')).toEqual({ amount: '6', unit: 'g', approx: true });
  });
  it('scales before converting', () => {
    expect(presentIngredient(line(1, 'cup', 'butter'), 1.5, 'grams')).toEqual({ amount: '340', unit: 'g', approx: true });
  });
  it('converts weight units exactly', () => {
    expect(presentIngredient(line(8, 'oz', 'dark chocolate'), 1, 'grams')).toEqual({ amount: '227', unit: 'g' });
    expect(presentIngredient(line(2, 'lb', 'pork ribs'), 1, 'grams')).toEqual({ amount: '907', unit: 'g' });
  });
  it('prefers an entered exact weight', () => {
    expect(presentIngredient(line(2, 'cup', 'flour', 250), 1.5, 'grams')).toEqual({ amount: '375', unit: 'g' });
  });
  it('falls back to metric when an ingredient cannot be weighed', () => {
    expect(presentIngredient(line(1, 'tsp', 'smoked paprika'), 1, 'grams')).toEqual({ amount: '5', unit: 'ml' });
    expect(presentIngredient(line(1, 'tsp', 'kosher salt'), 1, 'grams')).toEqual({ amount: '5', unit: 'ml' });
    expect(presentIngredient(line(4, null, 'eggs'), 1, 'grams')).toEqual({ amount: '4', unit: null });
  });
  it('knows common ingredients and not unknown ones', () => {
    expect(densityFor('dark brown sugar')).toBeCloseTo(213 / 240);
    expect(densityFor('buttermilk')).toBeCloseTo(1);
    expect(densityFor('saffron')).toBeNull();
  });
});

describe('time formatting', () => {
  it('formats minutes and timers', () => {
    expect(formatMinutes(75)).toBe('1 hr 15 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(240)).toBe('4 hr');
    expect(formatTimer(1200)).toBe('20:00');
    expect(formatTimer(3600)).toBe('1:00:00');
  });
});
