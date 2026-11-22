# Cucina Malerba

A family recipe box at **[recipes.jmalerba.dev](https://recipes.jmalerba.dev)**. Anyone can browse recipes, cook from them and keep a shopping list on their own device. Only invited family can add or change recipes.

> Status: all milestones done (1–11). For everyone: browsing, forgiving search, fridge mode, cook mode, a shopping list kept on the device, collections, printing (full page or 4×6 card), and an installable home-screen app. Family (three roles) can add, edit and import recipes (including from the phone share sheet), tidy them with AI, log "made it", leave notes, save variations and build collections.

## Stack

- **Client:** React + TypeScript, built with Vite (`client/`)
- **Server:** Node + Express 5 + TypeScript (`server/`), serving `/api/*` and the built client
- **Database:** Postgres via Drizzle ORM; migrations in `drizzle/`
- **Shared code:** `shared/` (for example the site name)
- **Hosting:** one Docker container on Google Cloud Run behind Firebase Hosting (custom domain + HTTPS), Neon Postgres, DNS on Cloudflare, deploys from GitHub Actions

## Run it locally

Requires Node 24+ and Docker. With nvm, run `nvm use` (reads `.nvmrc`).

```sh
npm install
cp .env.example .env
npm run db:up          # starts Postgres in Docker
npm run db:generate    # first time only: creates the migration files in drizzle/
npm run db:migrate
npm run db:seed       # optional: 6 sample recipes (remove with: npm run db:seed -- --remove)
npm run dev            # API on :8080, web app on http://localhost:5173
```

The page should show "Server and database are up".

To try the production container locally: `docker compose --profile full up --build`, then open http://localhost:8080.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Express (with reload) + Vite dev server |
| `npm run build` | Builds the client to `dist/client` and compiles the server to `dist/server` |
| `npm start` | Runs the built server |
| `npm run typecheck` | Type-checks client and server |
| `npm test` | Runs Vitest |
| `npm run db:generate` | Creates a migration from changes to `server/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations to `DATABASE_URL` |
| `npm run db:seed` | Adds the sample recipes; `npm run db:seed -- --remove` deletes them |
| `npm run db:studio` | Opens Drizzle Studio to browse the database |

## Deploying

Pushing to `main` deploys automatically (`.github/workflows/deploy.yml`). The one-time account setup is in [docs/SETUP.md](docs/SETUP.md).

## Secrets

Nothing secret lives in this repo. Local secrets go in `.env` (git-ignored). Production secrets live in Google Secret Manager and GitHub Actions secrets.
