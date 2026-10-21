# Humor Admin

Superadmin console for **The Humor Project**. Source: [kaffy811/HumorProject-Admin](https://github.com/kaffy811/HumorProject-Admin) (mirrored from `admin/` in kaffy811/HumorProject). A separate Next.js 16 app and a separate Vercel project, using the **same Supabase database** (`wqkpatxsbxwjsupojjcq`) as the member app.

| Page | What it does |
| --- | --- |
| `/` Laugh Lab | Creative stats: laugh rate, time-to-first-laugh, peak comedy hour heatmap, funniest joke style, "is brevity the soul of wit?", photo → punchline funnel, hall of fame, crowd pleasers vs. generous laughers, self-Ha count, Gemini health/tokens/latency/failure stages, 30-day trend. |
| `/users`, `/users/[id]` | **Read** users and profiles: profile fields, auth email/providers/last sign-in, posts, Ha given/received, comments. Search + filters. |
| `/posts`, `/posts/new`, `/posts/[id]` | **Create / read / update / delete** every post, with tabs by caption source — *AI caption* (`ai`: a member published one of the AI candidates), *Member-written* (`handmade`: no AI), *Official seed* (`seed`: starter posts imported by `scripts/seed.ts` as Little Mao). Old `/media` links redirect here. upload an image + caption (stored privately as WebP with the blurred preview the member app needs), edit caption/style/source/scene description, soft-delete (same as an author delete), restore, or purge permanently (rows + Storage files). Shows the Gemini prompts, model, candidates and token usage behind each post. |
| `/requests` | Superadmin inbox: members who asked for access, with their message, email and post count. **Approve** (they become superadmins) or **Decline**; history of every decision. The sidebar shows a badge and the dashboard a banner while requests wait. |
| `/denied` | What a signed-in non-admin sees: a **Request superadmin access** button with an optional message, then the request's status (waiting / declined → request again). |
| `/ai`, `/ai/runs`, `/ai/runs/[id]` | **AI models & prompts**: per provider/model runs, success, tokens (in/out/thinking), median & p90 latency, how many runs became posts and their Ha/post; prompt versions with their exact system/user prompt and config; which of the four candidates members pick and how often they rewrite it; failure stages; requested styles; moderation verdicts. Every run is browsable with its full prompt, candidates and raw usage. Providers other than Gemini appear automatically once their runs are recorded in `humor_generations`. |
| `/rankings/*` | **Hot posts** and **Hottest creators** read the member Top page's own database function (`humor_leaderboard`), so ranks are identical (week / month / all). Rule: more Ha first; equal Ha → the newer post first (migration `202610220001`). **Most posts** ranks members by live posts. **Topics** ranks Columbia vs New York City vs general student life by Ha, using transparent keyword matching (`lib/topics.ts`). |
| `/activity` | **Activity log**: every sign-in/out, signup, upload, AI generation, publish/edit/delete/restore/purge, Ha/un-Ha, comment/reply, heart, save, report, profile change and superadmin request/decision, with category tabs, action/member/time filters and links. Recorded by database triggers (`202610220002`), so the member site and this console are both covered; admin edits are credited to the admin. Each user page shows their latest actions. |
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

## Access requests

Migration `supabase/migrations/202610210001_superadmin_requests.sql` (in kaffy811/HumorProject) adds `humor_admin_requests` (service-role only, one pending request per member) and `humor_decide_admin_request()`, which re-checks that the approver is a superadmin and closes the request and flips `is_superadmin` in one transaction. Until it is applied, the console works and the requests page explains what to run.

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
