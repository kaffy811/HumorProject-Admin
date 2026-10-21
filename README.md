# Humor Admin

Superadmin console for **The Humor Project**. Source: [kaffy811/HumorProject-Admin](https://github.com/kaffy811/HumorProject-Admin) (mirrored from `admin/` in kaffy811/HumorProject). A separate Next.js 16 app and a separate Vercel project, using the **same Supabase database** (`wqkpatxsbxwjsupojjcq`) as the member app.

| Page | What it does |
| --- | --- |
| `/` Laugh Lab | Creative stats: laugh rate, time-to-first-laugh, peak comedy hour heatmap, funniest joke style, "is brevity the soul of wit?", photo → punchline funnel, hall of fame, crowd pleasers vs. generous laughers, self-Ha count, Gemini health/tokens/latency/failure stages, 30-day trend. |
| `/users`, `/users/[id]` | **Read** users and profiles: profile fields, auth email/providers/last sign-in, posts, Ha given/received, comments. Search + filters. |
| `/media`, `/media/new`, `/media/[id]` | **Create / read / update / delete** AI-generated media: upload an image + caption (stored privately as WebP with the blurred preview the member app needs), edit caption/style/source/scene description, soft-delete (same as an author delete), restore, or purge permanently (rows + Storage files). Shows the Gemini prompts, model, candidates and token usage behind each post. |
| `/votes` | **Read** votes: per-post ratings (Ha, downvotes, net, Ha/day, Wilson confidence, comments — sortable), every Ha vote, every comment heart. |

## Security model

* Every route except `/login`, `/denied` and `/auth/*` is behind Google sign-in **and** `profiles.is_superadmin = true`.
* Three independent checks: `proxy.ts` (all requests, fails closed), `requireAdmin()` in every page/layout, and `requireAdmin()` again inside every Server Action (actions are reachable by direct POST).
* A session only counts if it is a fresh Google OAuth session (same `amr` rules as the member app); password/magic-link sessions are refused. The flag must be strictly boolean `true`.
* The service-role key is server-only and is used only after the gate. Private images are shown with 10-minute signed URLs. Pages are `private, no-store`, `noindex`, and cannot be framed.
* `is_superadmin` cannot be changed by members: profile UPDATE grants are column-scoped, and a trigger rejects changes from `anon`/`authenticated` JWTs even if a future migration widens grants.

## "Wouldn't I lock myself out?" — bootstrapping the first superadmin

Yes, if the only way to become an admin were the admin UI. So the flag is deliberately **not** settable from either app. The first superadmin is granted out-of-band by the database owner, who already holds more power than the console (SQL editor access / the service-role key):

1. Apply `supabase/migrations/202610200001_superadmin.sql` (adds `profiles.is_superadmin boolean not null default false`, the guard trigger, and the preview-schema column).
2. Sign in to the **member** app once with your Google account so `auth.users`/`profiles` rows exist.
3. Grant yourself, either in the Supabase SQL editor:
   ```sql
   update public.profiles set is_superadmin = true
   where id = (select id from auth.users where lower(email) = lower('you@school.edu'));
   ```
   or locally with the service key in `admin/.env.local`: `npm run grant-superadmin -- you@school.edu` (`--revoke` to undo).

The `/denied` page shows the signed-in email and the exact command, so a new admin knows what to ask an owner for.

## Deploy (separate Vercel project)

1. Vercel → Add New → Project → import **kaffy811/HumorProject-Admin** (Root Directory `./`) — or kaffy811/HumorProject with Root Directory `admin`. Framework Preset: **Next.js**.
2. Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (secret, never `NEXT_PUBLIC_`). Optional: `ADMIN_AUTH_ORIGIN=https://<admin production domain>` so all aliases start OAuth on one host; `HUMOR_DATA_SCHEMA` (`public` default).
3. Supabase → Authentication → URL Configuration → **Redirect URLs**: add `https://<admin domain>/auth/callback` (and each deployment URL you will sign in on, e.g. `https://*-humor-project8.vercel.app/auth/callback`). Without it Supabase falls back to the member app's Site URL. No Google Cloud change is needed: Google still redirects to Supabase's own callback.
4. Vercel → Settings → Deployment Protection → disable **Vercel Authentication** so the page opens in an incognito window (the app's own Google + superadmin gate still protects everything).

## Develop and check

```bash
cd admin
npm ci
cp .env.example .env.local   # fill in keys
npm run dev                   # http://localhost:3010 (add /auth/callback for it to Supabase Redirect URLs)
npm test                      # gate, redirects, validation, statistics
npm run lint && npx tsc --noEmit
npm run test:e2e              # builds against a local fake Supabase and checks every route's gate
```
SQL test for the migration (from the repo root): `node tests/superadmin-database.mjs`.
