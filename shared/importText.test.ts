import { describe, expect, it } from 'vitest';
import { normalizeSourceUrl, parseDurationMinutes, parseLink, parseYield, socialPlatform, splitRecipeText } from './importText';

describe('parseDurationMinutes', () => {
  it('reads recipe-data durations', () => {
    expect(parseDurationMinutes('PT1H30M')).toBe(90);
    expect(parseDurationMinutes('P0DT0H20M')).toBe(20);
    expect(parseDurationMinutes('PT45S')).toBe(1);
    expect(parseDurationMinutes('PT0S')).toBeNull();
  });
  it('reads plain-language times', () => {
    expect(parseDurationMinutes('1 hr 15 mins')).toBe(75);
    expect(parseDurationMinutes('25 minutes')).toBe(25);
    expect(parseDurationMinutes('soon')).toBeNull();
  });
});

describe('parseYield', () => {
  it('prefers an entry with a label', () => {
    expect(parseYield(['8', '8 servings'])).toEqual({ servings: 8, label: 'servings' });
    expect(parseYield('Makes 24 cookies')).toEqual({ servings: 24, label: 'cookies' });
    expect(parseYield('4-6 people')).toEqual({ servings: 4, label: 'servings' });
    expect(parseYield(6)).toEqual({ servings: 6, label: 'servings' });
    expect(parseYield(undefined)).toEqual({ servings: null, label: null });
  });
});

describe('links', () => {
  it('spots social platforms', () => {
    expect(socialPlatform('www.instagram.com')).toBe('Instagram');
    expect(socialPlatform('vm.tiktok.com')).toBe('TikTok');
    expect(socialPlatform('youtu.be')).toBe('YouTube');
    expect(socialPlatform('www.seriouseats.com')).toBeNull();
  });
  it('adds https and rejects non-web links', () => {
    expect(parseLink('smittenkitchen.com/2020/01/x')?.href).toBe('https://smittenkitchen.com/2020/01/x');
    expect(parseLink('javascript:alert(1)')).toBeNull();
    expect(parseLink('localhost')).toBeNull();
    expect(parseLink('')).toBeNull();
  });
  it('drops tracking parameters and the fragment', () => {
    const url = new URL('https://WWW.Example.com/r/lemon-bars?utm_source=x&igsh=abc&page=2#comments');
    expect(normalizeSourceUrl(url)).toBe('https://www.example.com/r/lemon-bars?page=2');
  });
});

describe('splitRecipeText', () => {
  it('uses headings when the text has them', () => {
    const caption = `Lemon Bars 🍋
The easiest bars ever. Serves 16

INGREDIENTS:
For the crust:
• 2 cups flour
• 1/2 cup powdered sugar
• 1 cup butter, softened
Pinch of salt

Instructions 👇
1. Heat the oven to 350°F.
2. Press the crust into the pan and bake 20 minutes.

#lemonbars #baking #dessert`;
    const r = splitRecipeText(caption);
    expect(r.usedHeadings).toBe(true);
    expect(r.title).toBe('Lemon Bars');
    expect(r.ingredients).toEqual(['For the crust:', '2 cups flour', '1/2 cup powdered sugar', '1 cup butter, softened', 'Pinch of salt']);
    expect(r.steps).toEqual(['Heat the oven to 350°F.', 'Press the crust into the pan and bake 20 minutes.']);
    expect(r.tags).toEqual(['lemonbars', 'baking', 'dessert']);
    expect(r.servings).toBe(16);
    expect(r.description).toBe('The easiest bars ever. Serves 16');
  });

  it('guesses line by line without headings', () => {
    const text = `Weeknight pasta
200 g spaghetti
2 tbsp olive oil
3 cloves garlic, sliced
Parmesan
Boil the pasta until just tender, about 9 minutes.
Meanwhile warm the oil and garlic over low heat.
Toss everything together with a splash of pasta water.`;
    const r = splitRecipeText(text);
    expect(r.usedHeadings).toBe(false);
    expect(r.title).toBe('Weeknight pasta');
    expect(r.ingredients).toEqual(['200 g spaghetti', '2 tbsp olive oil', '3 cloves garlic, sliced', 'Parmesan']);
    expect(r.steps.length).toBe(3);
  });

  it('reads prep and cook times', () => {
    const r = splitRecipeText('Prep time: 15 mins\nCook time: 1 hr 10 mins\nIngredients\n1 egg\nMethod\nCook it.');
    expect(r.prepMinutes).toBe(15);
    expect(r.cookMinutes).toBe(70);
  });

  it('turns ALL-CAPS and "For the…" lines into groups, and calms an ALL-CAPS title', () => {
    const r = splitRecipeText('FIRECRACKER RAMEN\nIngredients\nBROTH\n1 tbsp chilli oil\n500 ml stock\nTO SERVE\nNoodles of choice\nLime\nMethod\nSimmer the broth 10 minutes.');
    expect(r.title).toBe('Firecracker Ramen');
    expect(r.ingredients).toEqual(['Broth:', '1 tbsp chilli oil', '500 ml stock', 'To serve:', 'Noodles of choice', 'Lime']);
  });
});
