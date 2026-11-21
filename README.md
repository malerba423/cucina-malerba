# Cucina Malerba

A family recipe box at **[kitchen.jmalerba.dev](https://kitchen.jmalerba.dev)**. Anyone can browse recipes, cook from them and keep a shopping list on their own device. Only invited family can add or change recipes.

> Status: milestone 1 (skeleton). The live site is a hello-world page that checks the server and database are connected.

## Stack

- **Client:** React + TypeScript, built with Vite (`client/`)
- **Server:** Node + Express 5 + TypeScript (`server/`), serving `/api/*` and the built client
- **Database:** Postgres via Drizzle ORM; migrations in `drizzle/`
- **Shared code:** `shared/` (for example the site name)
- **Hosting:** one Docker container on Google Cloud Run behind Firebase Hosting (custom domain + HTTPS), Neon Postgres, DNS on Cloudflare, deploys from GitHub Actions

## Run it locally

Requires Node 22+ and Docker.

```sh
npm install
cp .env.example .env
npm run db:up          # starts Postgres in Docker
npm run db:generate    # first time only: creates the migration files in drizzle/
npm run db:migrate
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
| `npm run db:studio` | Opens Drizzle Studio to browse the database |

## Deploying

Pushing to `main` deploys automatically (`.github/workflows/deploy.yml`). The one-time account setup is in [docs/SETUP.md](docs/SETUP.md).

## Secrets

Nothing secret lives in this repo. Local secrets go in `.env` (git-ignored). Production secrets live in Google Secret Manager and GitHub Actions secrets.
