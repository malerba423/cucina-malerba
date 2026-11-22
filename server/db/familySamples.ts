// A few sample family recipes, to see how the site feels with more than one
// family member in it. Credited by origin ("From Mary's kitchen") to the
// people on the invite list; nobody's account is created or touched. Every one
// is tagged "sample", and --remove deletes exactly these.
//
//   npm run db:family-samples               add them (skips any already there)
//   npm run db:family-samples -- --remove   take them all out again
//
// Uses DATABASE_URL, so it targets whichever database that points at.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { invites, people, recipeIngredients, recipeSteps, recipeTags, recipes, tags, users } from './schema.js';
import { parseIngredientText, parseStepText } from '../../shared/parse.js';

type Sample = {
  email: string;
  slug: string;
  title: string;
  description: string;
  servings: number;
  yieldLabel: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  tags: string[];
  ingredients: string;
  steps: string;
  addedDaysAgo: number;
};

const SAMPLES: Sample[] = [
  {
    email: 'malerbamary@gmail.com',
    slug: 'sample-sunday-gravy',
    title: 'Sunday Gravy',
    description: 'The big pot that simmers all afternoon. Sample recipe for trying out the site.',
    servings: 8,
    yieldLabel: 'servings',
    prepMinutes: 30,
    cookMinutes: 180,
    totalMinutes: 210,
    tags: ['sample', 'pasta', 'sunday'],
    ingredients: `For the meat:
1 lb Italian sausage links
1 1/2 lb pork ribs
1 lb beef chuck, in 2 pieces
For the sauce:
3 tbsp olive oil
1 onion, finely chopped
4 cloves garlic, sliced
2 tbsp tomato paste
2 (28 oz) cans crushed tomatoes
1 cup water
1 bay leaf
Salt and pepper
Handful of fresh basil`,
    steps: `Brown the sausage, ribs and beef in the olive oil in a large pot, in batches. Set aside.
Soften the onion in the same pot, about 8 minutes, then add the garlic and tomato paste for 1 minute.
Add the tomatoes, water and bay leaf, scraping up the browned bits.
Return the meat, bring to a gentle simmer and cook, partly covered, for 3 hours, stirring now and then.
Season, tear in the basil, and serve the sauce over pasta with the meat on a platter.`,
    addedDaysAgo: 12,
  },
  {
    email: 'malerbamary@gmail.com',
    slug: 'sample-anise-pizzelle',
    title: 'Anise Pizzelle',
    description: 'Thin, crisp holiday cookies from the pizzelle iron. Sample recipe for trying out the site.',
    servings: 30,
    yieldLabel: 'cookies',
    prepMinutes: 15,
    cookMinutes: 30,
    totalMinutes: 45,
    tags: ['sample', 'cookies', 'christmas'],
    ingredients: `3 large eggs
3/4 cup sugar
1/2 cup butter, melted and cooled
1 tsp anise extract
1 1/2 cups all-purpose flour
2 tsp baking powder
Pinch of salt`,
    steps: `Heat the pizzelle iron.
Beat the eggs and sugar until pale, then mix in the butter and anise.
Stir in the flour, baking powder and salt to a thick batter.
Drop a heaping teaspoon onto each pattern and cook about 45 seconds, until golden.
Cool flat on a rack; they crisp as they cool.`,
    addedDaysAgo: 5,
  },
  {
    email: 'claralovesyams@gmail.com',
    slug: 'sample-maple-roasted-sweet-potatoes',
    title: 'Maple-Roasted Sweet Potatoes',
    description: 'Crispy edges, sticky maple glaze. Sample recipe for trying out the site.',
    servings: 4,
    yieldLabel: 'servings',
    prepMinutes: 10,
    cookMinutes: 35,
    totalMinutes: 45,
    tags: ['sample', 'side', 'vegetarian'],
    ingredients: `2 lb sweet potatoes, cut into wedges
2 tbsp olive oil
2 tbsp maple syrup
1/2 tsp smoked paprika
1 tsp kosher salt
Flaky salt, to serve`,
    steps: `Heat the oven to 425°F.
Toss the sweet potatoes with the oil, paprika and salt on a sheet pan and spread out.
Roast 25 minutes, flipping halfway.
Drizzle with the maple syrup and roast 10 minutes more, until sticky.
Finish with flaky salt.`,
    addedDaysAgo: 9,
  },
  {
    email: 'claralovesyams@gmail.com',
    slug: 'sample-miso-sweet-potato-soup',
    title: 'Miso Sweet Potato Soup',
    description: 'Silky, savory and quick. Sample recipe for trying out the site.',
    servings: 4,
    yieldLabel: 'servings',
    prepMinutes: 10,
    cookMinutes: 25,
    totalMinutes: 35,
    tags: ['sample', 'soup', 'vegetarian'],
    ingredients: `1 tbsp butter
1 onion, chopped
1 tbsp grated ginger
1 1/2 lb sweet potatoes, peeled and cubed
4 cups vegetable stock
2 tbsp white miso
Sliced scallions, to serve`,
    steps: `Melt the butter in a pot and soften the onion and ginger, about 5 minutes.
Add the sweet potatoes and stock and simmer 20 minutes, until very soft.
Take off the heat, whisk in the miso, and blend until smooth.
Serve topped with scallions.`,
    addedDaysAgo: 2,
  },
];

const DAY = 24 * 60 * 60 * 1000;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const upsertPerson = async (tx: Tx, name: string) =>
  (
    await tx
      .insert(people)
      .values({ name })
      .onConflictDoUpdate({ target: people.name, set: { name: sql`excluded.name` } })
      .returning({ id: people.id })
  )[0].id;

const upsertTag = async (tx: Tx, name: string) =>
  (
    await tx
      .insert(tags)
      .values({ name })
      .onConflictDoUpdate({ target: tags.name, set: { name: sql`excluded.name` } })
      .returning({ id: tags.id })
  )[0].id;

async function add() {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).limit(1);
  const inviteRows = await db.select({ email: invites.email, name: invites.name }).from(invites);
  const nameFor = (email: string) => inviteRows.find((i) => i.email.toLowerCase() === email)?.name ?? email.split('@')[0];
  const have = new Set((await db.select({ slug: recipes.slug }).from(recipes)).map((r) => r.slug));

  let added = 0;
  for (const s of SAMPLES) {
    if (have.has(s.slug)) continue;
    const createdAt = new Date(Date.now() - s.addedDaysAgo * DAY);
    const person = nameFor(s.email);
    await db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(recipes)
        .values({
          slug: s.slug,
          title: s.title,
          description: s.description,
          sourceType: 'person',
          sourcePersonId: await upsertPerson(tx, person),
          servings: s.servings,
          yieldLabel: s.yieldLabel,
          prepMinutes: s.prepMinutes,
          cookMinutes: s.cookMinutes,
          totalMinutes: s.totalMinutes,
          addedByUserId: owner?.id ?? null,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: recipes.id });
      const lines = parseIngredientText(s.ingredients).lines;
      await tx.insert(recipeIngredients).values(
        lines.map((l, position) => ({
          recipeId: recipe.id,
          position,
          groupLabel: l.groupLabel,
          rawText: l.rawText,
          quantity: l.quantity,
          quantityMax: l.quantityMax,
          unit: l.unit,
          item: l.item,
          note: l.note,
        })),
      );
      await tx.insert(recipeSteps).values(parseStepText(s.steps).map((st, position) => ({ recipeId: recipe.id, position, ...st })));
      for (const t of s.tags) await tx.insert(recipeTags).values({ recipeId: recipe.id, tagId: await upsertTag(tx, t) });
    });
    console.log(`  added "${s.title}" from ${person}'s kitchen`);
    added++;
  }
  console.log(`Added ${added} sample family recipe(s); ${SAMPLES.length - added} were already there.`);
}

async function remove() {
  const [sampleTag] = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, 'sample')).limit(1);
  const slugs = SAMPLES.map((s) => s.slug);
  // Only recipes that are both on this list and tagged "sample": nothing real can be caught.
  const targets = sampleTag
    ? await db
        .select({ id: recipes.id, personId: recipes.sourcePersonId })
        .from(recipes)
        .innerJoin(recipeTags, and(eq(recipeTags.recipeId, recipes.id), eq(recipeTags.tagId, sampleTag.id)))
        .where(inArray(recipes.slug, slugs))
    : [];
  if (targets.length) await db.delete(recipes).where(inArray(recipes.id, targets.map((t) => t.id)));

  // Tidy up the people rows these created, if nothing else uses them.
  const personIds = [...new Set(targets.map((t) => t.personId).filter((id): id is number => id != null))];
  let peopleRemoved = 0;
  for (const id of personIds) {
    const [used] = await db.execute<{ n: number }>(sql`
      select (select count(*) from recipes where source_person_id = ${id})
           + (select count(*) from users where person_id = ${id})
           + (select count(*) from cook_logs where person_id = ${id}) as n`).then((r) => r.rows);
    if (Number(used?.n ?? 1) === 0) {
      await db.delete(people).where(eq(people.id, id));
      peopleRemoved++;
    }
  }
  if (sampleTag) {
    const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(recipeTags).where(eq(recipeTags.tagId, sampleTag.id));
    if (!left.n) await db.delete(tags).where(eq(tags.id, sampleTag.id));
  }
  console.log(`Removed ${targets.length} sample family recipe(s) and ${peopleRemoved} unused name(s).`);
}

try {
  await (process.argv.includes('--remove') ? remove() : add());
} finally {
  await pool.end();
}
