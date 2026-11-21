import { describe, expect, it } from 'vitest';
import { decodeEntities, extractFromHtml, readMeta } from './extract.js';

const recipePage = `<!doctype html><html><head>
<title>Lemon Bars | Example Kitchen</title>
<meta property="og:site_name" content="Example Kitchen">
<meta property="og:image" content="/img/og.jpg">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Example Kitchen"},
  {"@type":["Recipe"],"name":"Lemon Bars &amp; Friends",
   "description":"<p>Bright, <b>tangy</b> bars.</p>",
   "author":[{"@type":"Person","name":"Pat Cook"}],
   "image":[{"@type":"ImageObject","url":"https://cdn.example.com/bars.jpg"}],
   "recipeYield":["16","16 bars"],
   "prepTime":"PT20M","cookTime":"PT45M","totalTime":"PT1H5M",
   "recipeCategory":"Dessert","keywords":"lemon, bars, Easy",
   "recipeIngredient":["▢ 2 cups all-purpose flour","&frac12; cup powdered sugar","1 cup butter, softened"],
   "recipeInstructions":[
     {"@type":"HowToSection","name":"Crust","itemListElement":[
       {"@type":"HowToStep","text":"Heat the oven to 350°F."},
       {"@type":"HowToStep","text":"Press the crust into the pan and bake 20 minutes."}]},
     {"@type":"HowToStep","text":"Pour over the filling and bake 25 minutes more."}
   ]}
]}
</script></head><body></body></html>`;

describe('extractFromHtml', () => {
  it('reads schema.org recipe data', () => {
    const { draft, found, notes } = extractFromHtml(recipePage, 'https://www.example.com/lemon-bars/');
    expect(found).toBe('recipe');
    expect(notes).toEqual([]);
    expect(draft.title).toBe('Lemon Bars & Friends');
    expect(draft.description).toBe('Bright, tangy bars.');
    expect(draft.sourceType).toBe('website');
    expect(draft.sourceName).toBe('Example Kitchen');
    expect(draft.sourceNote).toBe('By Pat Cook');
    expect(draft.imageUrl).toBe('https://cdn.example.com/bars.jpg');
    expect(draft.servings).toBe(16);
    expect(draft.yieldLabel).toBe('bars');
    expect([draft.prepMinutes, draft.cookMinutes, draft.totalMinutes]).toEqual([20, 45, 65]);
    expect(draft.tags).toEqual(['dessert', 'lemon', 'bars', 'easy']);
    expect(draft.ingredients).toEqual(['2 cups all-purpose flour', '½ cup powdered sugar', '1 cup butter, softened']);
    expect(draft.steps).toEqual([
      'Heat the oven to 350°F.',
      'Press the crust into the pan and bake 20 minutes.',
      'Pour over the filling and bake 25 minutes more.',
    ]);
  });

  it('reads an Instagram caption from the preview tags', () => {
    const html = `<html><head>
<meta property="og:title" content="Nonna Eats on Instagram: &quot;Sunday sauce&quot;">
<meta property="og:image" content="https://scontent.cdninstagram.com/x.jpg">
<meta property="og:description" content="1,204 likes, 33 comments - nonnaeats on March 3, 2025: &quot;Sunday sauce 🍅&#10;Ingredients:&#10;2 tbsp olive oil&#10;1 onion, diced&#10;28 oz crushed tomatoes&#10;Method:&#10;1. Soften the onion in the oil.&#10;2. Add tomatoes and simmer 2 hours.&#10;#sundaysauce #italian&quot;.">
</head></html>`;
    const { draft, found } = extractFromHtml(html, 'https://www.instagram.com/p/abc123/');
    expect(found).toBe('text');
    expect(draft.sourceType).toBe('social');
    expect(draft.sourceName).toBe('Instagram');
    expect(draft.sourceNote).toBe('From @nonnaeats');
    expect(draft.title).toBe('Sunday sauce');
    expect(draft.ingredients).toEqual(['2 tbsp olive oil', '1 onion, diced', '28 oz crushed tomatoes']);
    expect(draft.steps).toEqual(['Soften the onion in the oil.', 'Add tomatoes and simmer 2 hours.']);
    expect(draft.tags).toEqual(['sundaysauce', 'italian']);
    expect(draft.imageUrl).toBe('https://scontent.cdninstagram.com/x.jpg');
  });

  it('says so when a social post shares nothing useful', () => {
    const html = `<html><head><title>Instagram</title><meta property="og:title" content="Instagram"></head></html>`;
    const { found, notes } = extractFromHtml(html, 'https://www.instagram.com/reel/xyz/');
    expect(found).toBe('little');
    expect(notes[0]).toMatch(/Paste text/);
  });

  it('falls back to microdata', () => {
    const html = `<html><head><meta property="og:title" content="Old Site Chili"></head><body>
<li itemprop="recipeIngredient">1 lb ground beef</li><li itemprop="recipeIngredient">2 cans beans</li>
<div itemprop="recipeInstructions"><p>Brown the beef.</p><p>Add beans and simmer.</p></div></body></html>`;
    const { draft, found } = extractFromHtml(html, 'http://oldsite.example.org/chili');
    expect(found).toBe('recipe');
    expect(draft.title).toBe('Old Site Chili');
    expect(draft.sourceName).toBe('oldsite.example.org');
    expect(draft.ingredients).toEqual(['1 lb ground beef', '2 cans beans']);
    expect(draft.steps).toEqual(['Brown the beef.', 'Add beans and simmer.']);
  });

  it('reports pages with no recipe', () => {
    const { found, notes } = extractFromHtml('<html><head><title>News</title></head><body><p>Hello</p></body></html>', 'https://news.example.com/');
    expect(found).toBe('little');
    expect(notes.length).toBe(1);
  });
});

describe('helpers', () => {
  it('decodes numeric, named and double-encoded entities', () => {
    expect(decodeEntities('&#189; cup &amp;frac14; tsp &#x2022; &rsquo;')).toBe('½ cup ¼ tsp • ’');
  });
  it('reads meta tags with either quote style', () => {
    const meta = readMeta(`<meta content='A' property='og:title'><meta name="description" content="B &amp; C">`);
    expect(meta.get('og:title')).toBe('A');
    expect(meta.get('description')).toBe('B & C');
  });
});
