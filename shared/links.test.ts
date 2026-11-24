import { describe, expect, it } from 'vitest';
import { isVideo, linkLabel, splitLinks } from './links.js';

describe('links in recipe text', () => {
  it('turns addresses into links and keeps the rest as text', () => {
    expect(splitLinks('Watch https://www.youtube.com/watch?v=abc123 first.')).toEqual([
      'Watch ',
      { url: 'https://www.youtube.com/watch?v=abc123', label: 'YouTube video' },
      ' first.',
    ]);
    expect(splitLinks('(see www.seriouseats.com/roux)')).toEqual(['(see ', { url: 'https://www.seriouseats.com/roux', label: 'seriouseats.com/roux' }, ')']);
    expect(splitLinks('No links here, 350°F.')).toEqual(['No links here, 350°F.']);
  });
  it('labels and spots videos', () => {
    expect(linkLabel('https://youtu.be/xyz')).toBe('YouTube video');
    expect(linkLabel('https://www.kingarthurbaking.com/recipes/a-very-long-recipe-address-indeed')).toBe('kingarthurbaking.com/recipes/a-ve…');
    expect(isVideo('https://youtu.be/xyz')).toBe(true);
    expect(isVideo('https://www.seriouseats.com/x')).toBe(false);
  });
});
