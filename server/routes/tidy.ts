import { Router } from 'express';
import { env } from '../env.js';
import { requireRole } from '../auth/session.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import { TidyError, tidyAvailable, tidyRecipe } from '../tidy.js';
import { TIDY_MAX_CHARS, type TidyRequest } from '../../shared/tidy.js';

// "Tidy this up": family only, and limited three ways so a bug or a loop can't
// run up a bill: per person per hour, per server per day, and the monthly
// spending limit set in the Anthropic console.
export const tidyRouter = Router();

const perUser = createRateLimiter(30, 60 * 60 * 1000);
const perDay = createRateLimiter(env.tidyPerDay, 24 * 60 * 60 * 1000);

// GET /api/tidy/status: whether to show the button.
tidyRouter.get('/tidy/status', (_req, res) => {
  res.json({ available: tidyAvailable() });
});

// POST /api/tidy { title, description, servings, ingredients, steps }
tidyRouter.post('/tidy', requireRole('contributor'), async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const text = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  const request: TidyRequest = {
    title: text('title'),
    description: text('description'),
    servings: text('servings'),
    ingredients: text('ingredients'),
    steps: text('steps'),
  };
  const size = Object.values(request).reduce((n, v) => n + v.length, 0);
  if (!request.ingredients.trim() && !request.steps.trim()) {
    res.status(400).json({ error: 'Add the ingredients or steps first, even if they’re messy.' });
    return;
  }
  if (size > TIDY_MAX_CHARS) {
    res.status(413).json({ error: 'That’s too much text to tidy at once. Trim it to just the recipe.' });
    return;
  }
  if (!perUser.take(String(res.locals.user!.id))) {
    res.status(429).json({ error: 'That’s a lot of tidying for one hour. Try again a bit later.' });
    return;
  }
  if (!perDay.take('all')) {
    res.status(429).json({ error: 'Tidy this up has reached today’s limit. It resets tomorrow.' });
    return;
  }
  try {
    res.json(await tidyRecipe(request));
  } catch (err) {
    if (err instanceof TidyError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
