# One-time setup

Getting milestone 1 live at **https://kitchen.jmalerba.dev**. Do the steps in order; each one ends with a check. Budget about an hour, plus waiting time for the HTTPS certificate in step 6.

How the pieces fit:

```
browser ─▶ kitchen.jmalerba.dev (Cloudflare DNS, "DNS only")
        ─▶ Firebase Hosting (free HTTPS for the custom domain)
        ─▶ Cloud Run service "cucina-malerba" (this repo's container)
        ─▶ Neon Postgres
```

Why Firebase Hosting in front: Cloud Run's own custom-domain feature is still in preview and Google doesn't recommend it for production. Firebase Hosting is Google's other low-cost way to put a custom domain on a Cloud Run service.

Placeholders used below — replace them everywhere:

| Placeholder | Example |
| --- | --- |
| `PROJECT_ID` | `cucina-malerba-4821` (must be globally unique) |
| `GH_REPO` | `your-github-username/cucina-malerba` |
| Region | `us-west1` (Oregon). Also hard-coded in `firebase.json`; change both if you pick another |

---

## 0. Before you start

- Install: Node 24+, Docker, the [gcloud CLI](https://cloud.google.com/sdk/docs/install), and the Firebase CLI (`npm install -g firebase-tools`).
- Create a **public** GitHub repo named `cucina-malerba` and push this code to `main` **after** step 1 below (the first push triggers a deploy, which will fail until steps 2–4 are done; that's fine, you can re-run it).
- In the repo's **Settings → Code security**, check that **Secret scanning** and **Push protection** are on.

## 1. Run it locally and create the first migration

```sh
npm install
cp .env.example .env
npm run db:up
npm run db:generate     # writes drizzle/0000_*.sql and drizzle/meta/ — commit these
npm run db:migrate
npm run dev
```

**Check:** http://localhost:5173 shows "Server and database are up". Commit `package-lock.json` and the `drizzle/` folder (the Docker build and the deploy both need them).

## 2. Neon (database)

1. Sign up at [neon.com](https://neon.com) (free plan, no card).
2. Create a project: name `cucina-malerba`, latest Postgres, region **AWS US West 2 (Oregon)** (closest to Cloud Run's us-west1).
3. On the project dashboard, open **Connect**, turn on **Connection pooling**, and copy the connection string. It looks like `postgresql://…-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require`.

Keep that string handy; it goes into Google Secret Manager (step 3) and GitHub (step 4). Never commit it.

**Check:** put it in your local `.env` temporarily, run `npm run db:migrate`, then switch `.env` back to the local database.

## 3. Google Cloud (app hosting)

```sh
export PROJECT_ID=cucina-malerba-XXXX
export REGION=us-west1
export GH_REPO=your-github-username/cucina-malerba

gcloud auth login
gcloud projects create "$PROJECT_ID" --name="Cucina Malerba"
gcloud config set project "$PROJECT_ID"

# Link billing (Cloud Run needs it, even inside the free tier)
gcloud billing accounts list
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX
```

**Set a budget alert now:** Console → Billing → Budgets & alerts → Create budget → this project, **$5/month**, email alerts at 50%, 90% and 100%.

```sh
# APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

# Where Docker images are stored (free up to 0.5 GB; delete old images now and then)
gcloud artifacts repositories create app --repository-format=docker --location="$REGION"

# Two service accounts: one the app runs as, one GitHub deploys as
gcloud iam service-accounts create cucina-run --display-name="Cucina Malerba runtime"
gcloud iam service-accounts create cucina-deploy --display-name="Cucina Malerba deploys (GitHub)"
export RUN_SA="cucina-run@$PROJECT_ID.iam.gserviceaccount.com"
export DEPLOY_SA="cucina-deploy@$PROJECT_ID.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/run.admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser

# The database URL, readable only by the runtime account
printf '%s' 'PASTE_THE_NEON_POOLED_URL_HERE' | gcloud secrets create DATABASE_URL --data-file=-
gcloud secrets add-iam-policy-binding DATABASE_URL --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor
```

Let GitHub Actions sign in to Google without a key file (Workload Identity Federation), and only from your repo:

```sh
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$GH_REPO'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GH_REPO"

# You'll need this value in step 4:
echo "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

## 4. GitHub (deploys)

In the repo: **Settings → Secrets and variables → Actions**.

**Variables** tab (these aren't secret):

| Name | Value |
| --- | --- |
| `GCP_PROJECT_ID` | your `PROJECT_ID` |
| `GCP_REGION` | `us-west1` |
| `GCP_WIF_PROVIDER` | the `projects/…/providers/github` line printed above |
| `GCP_DEPLOY_SA` | `cucina-deploy@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_RUN_SA` | `cucina-run@PROJECT_ID.iam.gserviceaccount.com` |

**Secrets** tab:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Neon pooled URL (used to run migrations during deploy) |

Then **Actions → Deploy → Run workflow** (or push to `main`).

**Check:** the run goes green, and this prints a `…run.app` address:

```sh
gcloud run services describe cucina-malerba --region="$REGION" --format='value(status.url)'
```

Open it: you should see the hello page with "Server and database are up", and `/api/health` returns `{"ok":true,…}`. The first load after a quiet spell takes a second or two while the container and Neon wake up.

## 5. Firebase Hosting (custom domain + HTTPS)

```sh
firebase login
firebase projects:addfirebase "$PROJECT_ID"
firebase deploy --only hosting --project "$PROJECT_ID"
```

`firebase.json` in this repo sends every request to the Cloud Run service. You only need to redeploy hosting if you change that file; normal app deploys don't touch it.

**Check:** `https://PROJECT_ID.web.app` shows the same hello page.

## 6. Cloudflare DNS (kitchen.jmalerba.dev)

1. Firebase console → **Hosting** → **Add custom domain** → `kitchen.jmalerba.dev`.
2. Firebase shows the DNS records to add (a TXT record to prove you own the domain, then the records that point at Firebase).
3. In Cloudflare → `jmalerba.dev` → **DNS → Records**, add exactly those records. For each one, set **Proxy status: DNS only** (grey cloud). If Cloudflare proxies them (orange cloud), Firebase can't verify the domain or issue the certificate.
4. Wait for Firebase to show the domain as connected and the certificate as issued. Often minutes, sometimes a few hours.

**Check:** https://kitchen.jmalerba.dev shows the hello page with a valid certificate, and

```sh
curl -sI https://kitchen.jmalerba.dev | grep -i x-robots-tag
```

prints `x-robots-tag: noindex, nofollow`.

## 7. Finishing touches

- Link to `https://kitchen.jmalerba.dev` from jmalerba.dev.
- Optional: a Cloudflare **Redirect Rule** from `jmalerba.dev/projects/kitchen*` to `https://kitchen.jmalerba.dev`.

## 8. Sign-in emails (Resend) — milestone 3

Sign-in links go out from `noreply@jmalerba.dev` through [Resend](https://resend.com) (free: 3,000 emails/month, 100/day).

1. Sign up at resend.com (no card needed).
2. **Domains → Add domain** → `jmalerba.dev`. Resend lists a few DNS records (for SPF and DKIM, which prove the emails really come from you). Add each one in **Cloudflare → DNS → Records**, exactly as shown, with **Proxy status: DNS only**. Then click **Verify** in Resend. Resend's records go on subdomains, so they shouldn't affect any email you already receive at jmalerba.dev.
3. Optional but recommended, if jmalerba.dev has no DMARC record yet: add a TXT record named `_dmarc` with the value `v=DMARC1; p=none;`. It helps Gmail trust the emails.
4. **API Keys → Create API key** with **Sending access** only, limited to `jmalerba.dev`. Copy it.
5. Store it for the live app (same terminal setup as step 3, with the key on your clipboard):
   ```sh
   pbpaste | gcloud secrets create RESEND_API_KEY --data-file=-
   gcloud secrets add-iam-policy-binding RESEND_API_KEY \
     --member="serviceAccount:cucina-run@$PROJECT_ID.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
   ```
6. GitHub → **Settings → Secrets and variables → Actions → Variables**: add `OWNER_EMAIL` = the email you'll sign in with.
7. Push to `main` (or re-run Deploy). Then go to https://kitchen.jmalerba.dev/signin, enter that email, and click the link. You're the owner; invite family from your name menu → **Who can add recipes**.

**Check:** the sign-in email arrives within a minute (look in spam the first time), and the header shows your name.

Locally, leave `RESEND_API_KEY` empty in `.env`: links are printed in the terminal running `npm run dev`.

---

## 9. Recipe photos (Cloud Storage) — milestone 4

Photos are resized in the browser (longest side 1600 px) before upload, so each one is a few hundred KB. They live in a public-read bucket (anyone can view a photo; only the app can add or delete one). Do this **before** pushing milestone 4.

1. In the same terminal setup as step 3 (`PROJECT_ID` set):
   ```sh
   BUCKET=$PROJECT_ID-photos
   gcloud storage buckets create gs://$BUCKET --location=us-west1 --uniform-bucket-level-access
   gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=allUsers --role=roles/storage.objectViewer
   gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member="serviceAccount:cucina-run@$PROJECT_ID.iam.gserviceaccount.com" --role=roles/storage.objectAdmin
   echo $BUCKET
   ```
   If the `allUsers` line fails with an organization policy error, your account has "public access prevention" on; turn it off for this bucket in Console → Cloud Storage → the bucket → Permissions, then run that line again.
2. GitHub → **Settings → Secrets and variables → Actions → Variables**: add `GCS_BUCKET` = the name printed above (no `gs://`).
3. In `.github/workflows/deploy.yml`, the deploy step's `--set-env-vars` line becomes:
   ```yaml
   --set-env-vars "OWNER_EMAIL=${{ vars.OWNER_EMAIL }},GCS_BUCKET=${{ vars.GCS_BUCKET }}"
   ```
4. Push to `main`.

**Check:** add a recipe with a photo on kitchen.jmalerba.dev; the photo's address starts with `https://storage.googleapis.com/`.

Locally, leave `GCS_BUCKET` empty in `.env`: photos are saved in `.uploads/` (git-ignored) and served at `/media`.

---

## 10. "Tidy this up" (Claude Haiku) — milestone 11

Optional. Without it the button just doesn't appear.

1. Go to platform.claude.com, sign in, and add a payment method under **Billing**. Buy the smallest amount of credit; at about a tenth of a cent per tidy-up it lasts a long time.
2. In the console's settings, find **Limits** and set a monthly **spend limit**, such as $5. That's the hard ceiling; the app also stops itself at 30 tidy-ups per person per hour and 200 per day.
3. Under **API keys**, create a key named `cucina-malerba` and copy it.
4. Store it for the live app (same terminal setup as step 3, key on your clipboard):
   ```sh
   pbpaste | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
   gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY --member="serviceAccount:cucina-run@$PROJECT_ID.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
   ```
   Then clear your clipboard.
5. In `.github/workflows/deploy.yml`, the `--set-secrets` line becomes:
   ```yaml
   --set-secrets "DATABASE_URL=DATABASE_URL:latest,RESEND_API_KEY=RESEND_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
   ```
6. Push to `main`.

**Check:** open any recipe's **Edit** page; a **✨ Tidy this up** button sits above Ingredients.

Locally, leave `ANTHROPIC_API_KEY` empty in `.env` unless you want to try it on your Mac (each tidy-up costs about a tenth of a cent).

---

## Good to know

- **Cookies:** Firebase Hosting forwards only a cookie named `__session` to Cloud Run and drops the rest. The sign-in work in milestone 3 must name its session cookie `__session`.
- **Caching:** Firebase's CDN caches responses that say they're cacheable. The hashed files in `/assets` are marked cacheable for a year; pages and `/api` responses aren't, so they always come fresh from the app.
- **Costs:** everything here sits inside free allowances at family scale. The $5 budget alert is the safety net.
- **Rolling back:** Cloud Run keeps old revisions. Console → Cloud Run → cucina-malerba → Revisions → send 100% of traffic to the previous one.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Deploy fails at "Sign in to Google Cloud" | A GitHub variable is wrong, or `GH_REPO` in the attribute condition doesn't match the repo name exactly (case matters) |
| Deploy fails at "Build and push image" with permission denied | `cucina-deploy` is missing `roles/artifactregistry.writer`, or the Artifact Registry repo isn't named `app` in `us-west1` |
| Deploy fails at "Run database migrations" | `DATABASE_URL` GitHub secret missing or wrong, or the `drizzle/` folder wasn't committed |
| Cloud Run says the container failed to start | Check Cloud Run → Logs. Usually `DATABASE_URL is not set` (secret not granted to `cucina-run`) |
| Page loads but says the database isn't reachable | The Secret Manager value is wrong; add a new version with `gcloud secrets versions add DATABASE_URL --data-file=-` and redeploy |
| Deploy fails with a secret "not found" error for RESEND_API_KEY | Step 8.5 not done yet: create the secret, then re-run Deploy |
| Sign-in email never arrives | Resend dashboard → Emails shows each send and why it failed; usually the domain isn't verified yet |
| Photo upload fails on the live site (Cloud Run logs show a storage error) | `cucina-run` lacks `roles/storage.objectAdmin` on the bucket (step 9) |
| Deploy fails with a secret "not found" error for ANTHROPIC_API_KEY | Step 10.4 not done yet: create the secret, or take it back out of deploy.yml |
| "Tidy this up" says the spending limit has been reached | Raise the monthly limit or add credit at platform.claude.com |
| Photos work at first, then vanish a while later | `GCS_BUCKET` isn't reaching Cloud Run (GitHub variable or the deploy.yml edit in step 9), so photos were saved inside the container |
| Photos upload but show as broken images | The `allUsers` viewer binding in step 9 is missing |
| "Request blocked: it did not come from this site" | The page was opened from a different address (e.g. the .web.app or .run.app URL). Use kitchen.jmalerba.dev |
| Custom domain stuck on "pending" | A Cloudflare record is proxied (orange cloud) or doesn't match what Firebase asked for |
