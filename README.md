# Humor Admin

Superadmin console for **The Humor Project**. Source: [kaffy811/HumorProject-Admin](https://github.com/kaffy811/HumorProject-Admin) (mirrored from `admin/` in kaffy811/HumorProject). A separate Next.js 16 app and a separate Vercel project, using the **same Supabase database** (`wqkpatxsbxwjsupojjcq`) as the member app.

| Page | What it does |
| --- | --- |
| `/` Laugh Lab | Creative stats: laugh rate, time-to-first-laugh, peak comedy hour heatmap, funniest joke style, "is brevity the soul of wit?", photo → punchline funnel, hall of fame, crowd pleasers vs. generous laughers, self-Ha count, Gemini health/tokens/latency/failure stages, 30-day trend. |
| `/users`, `/users/[id]` | **Read** users and profiles: profile fields, auth email/providers/last sign-in, posts, Ha given/received, comments. Search + filters. |
| `/posts`, `/posts/new`, `/posts/[id]` | **Create / read / update / delete** every post, with tabs by caption source — *AI caption* (`ai`: a member published one of the AI candidates), *Member-written* (`handmade`: no AI), *Official seed* (`seed`: starter posts imported by `scripts/seed.ts` as Little Mao). Old `/media` links redirect here. upload an image + caption (stored privately as WebP with the blurred preview the member app needs), edit caption/style/source/scene description, soft-delete (same as an author delete), restore, or purge permanently (rows + Storage files). Shows the Gemini prompts, model, candidates and token usage behind each post. |
| `/posts/new` | **New post** — the member Create flow in five steps: upload (drag, click or paste; resized in the browser), *Let the baby write* (with an optional direction) or *I'll write it*, generation with the **same model and prompt as members** (prompt-chain mix from AI models & prompts, falling back to the built-in Gemini prompt — `lib/generation-route.ts` and `lib/builtin-prompt.ts` are copies of the member app's), pick and edit one of four captions or regenerate, then preview and post from your own account. Every run is recorded in `humor_generations`; unpublished uploads stay hidden and *Start over* deletes them. Needs `GEMINI_API_KEY` (and `OPENAI_API_KEY` for OpenAI chains) on this Vercel project. |
| `/requests` | Superadmin inbox: members who asked for access, with their message, email and post count. **Approve** (they become superadmins) or **Decline**; history of every decision. The sidebar shows a badge and the dashboard a banner while requests wait. |
| `/denied` | What a signed-in non-admin sees: a **Request superadmin access** button with an optional message, then the request's status (waiting / declined → request again). |
| `/ai`, `/ai/runs`, `/ai/runs/[id]` | **AI models & prompts**: per provider/model runs, success, tokens (in/out/thinking), median & p90 latency, how many runs became posts and their Ha/post; prompt versions with their exact system/user prompt and config; which of the four candidates members pick and how often they rewrite it; failure stages; requested styles; moderation verdicts. Every run is browsable with its full prompt, candidates and raw usage. Providers other than Gemini appear automatically once their runs are recorded in `humor_generations`. |
| `/rankings/*` | **Hot posts** and **Hottest creators** read the member Top page's own database function (`humor_leaderboard`), so ranks are identical (week / month / all). Rule: more Ha first; equal Ha → the newer post first (migration `202610220001`). **Most posts** ranks members by live posts. **Topics** ranks Columbia vs New York City vs general student life by Ha, using transparent keyword matching (`lib/topics.ts`). |
| `/activity` | **Activity log**: every sign-in/out, signup, upload, AI generation, publish/edit/delete/restore/purge, like/unlike/dislike/undislike (`humor_votes.value` 1 / −1, migration `202610240001`), comment/reply, heart, save, report, profile change and superadmin request/decision, with category tabs, action/member/time filters and links. Recorded by database triggers (`202610220002`), so the member site and this console are both covered; admin edits are credited to the admin. Each user page shows their latest actions. |
| `/rankings/ratings`, `/rankings/votes`, `/rankings/hearts` (old `/votes` redirects) | **Read** votes, now inside Rankings & votes: per-post ratings (Ha, downvotes, net, Ha/day, Wilson confidence, comments — sortable), every Ha vote, every comment heart. |
| `/ai/prompt-chains`, `/ai/prompt-chains/[id]` | **Create / read / update / delete** prompt chains and their steps (system/user prompt, model, output JSON schema), tabbed by the provider of the step 1 model (e.g. Gemini vs GPT), with real run counts and success rate per chain (matched on `humor_generations.prompt_version`). |
| `/ai` and `/ai/llm-models` → **Model for members** | **Read / update** the prompt chain mix as one choice: the chain (and its step 1 model) every member generation uses; saving gives it 100% of `humor_prompt_chain_mix` via `humor_set_prompt_chain_mix()`. Members never choose. Options the member app cannot run are greyed out with the reason (`lib/chain-check.ts`); each option can be deleted (the chain, not the model) unless members are using it. The member app (`lib/generation-route.ts`) falls back to the built-in Gemini prompt when the chosen model fails. |
| `/ai/test-run` | **Test run**: run step 1 of a prompt chain on one uploaded photo with any configured model and see the captions, styles, tokens, latency and raw response. Connectors in `lib/llm.ts` for providers with slug `google` (needs `GEMINI_API_KEY`) and `openai` (needs `OPENAI_API_KEY`, Chat Completions with image input and a strict JSON schema, falling back to JSON mode). Admin-only; members are unaffected; runs are billed by the provider. **Save as example** keeps any caption (with its style, the scene and the chain) in AI generation examples. |
| `/ai/runs` | **Read** generation requests (who, model, prompt version, tokens, latency, post). |
| `/ai/responses` | **Read** LLM responses: the four captions and styles each call returned, scene, tokens in/out/thinking, latency, failure stage. Filter by model, status and a New York time range. |
| `/ai/terms`, `/ai/examples`, `/ai/llm-models` (providers are a section of the same page; each opens at `/ai/llm-providers/[id]`), `/team/signup-domains`, `/team/whitelisted-emails` | **Create / read / update / delete** terms, AI generation examples, LLM models, LLM providers, allowed sign-up domains and whitelisted emails. One definition per table in `lib/catalog.ts` drives the list, search, forms, validation (mirrors the SQL checks) and server actions. Deleting a provider that still has models is refused. The sign-up lists are tabs of Team & access and, like it, superadmin-only. Every change is written to the activity log. The member app does not enforce the domain and email lists yet. |

## Week 7 checklist

Items 4–12 are tabs of **AI models & prompts** (`/ai`); the sign-up lists are tabs of **Team & access** (`/team`).

| Requirement | Where |
| --- | --- |
| Read users | `/users`, `/users/[id]` |
| Read prompt chains / prompt chain steps (plus create, update, delete) | `/ai/prompt-chains`, `/ai/prompt-chains/[id]` |
| Read / update prompt chain mix | Model for members on `/ai` and `/ai/llm-models` |
| CRUD terms | `/ai/terms` |
| Read / view AI generated media | `/posts?source=ai` (Posts → AI caption tab), each post shows its AI runs |
| Read generation requests | `/ai/runs` |
| CRUD AI generation examples | `/ai/examples` |
| CRUD LLM models / LLM providers | `/ai/llm-models` (providers are a section of the same page; each opens at `/ai/llm-providers/[id]`) |
| Read LLM responses | `/ai/responses` |
| CRUD allowed sign-up domains / whitelisted emails | `/team/signup-domains`, `/team/whitelisted-emails` (superadmins) |
| CRUD images, including upload | `/posts/new` (upload), `/posts/[id]` (edit, delete, restore, purge) |

The new tables come from migration `supabase/migrations/202610280001_admin_catalog.sql` in kaffy811/HumorProject (tested by `node tests/admin-catalog-database.mjs` there). It seeds the Gemini provider and model, one prompt chain per prompt version already recorded (with that version's newest prompts), the current `caption-styles-v3` prompt, a 100% mix on it, campus terms and columbia.edu / barnard.edu. Until the migration is applied, these pages show a notice saying what to run.

## Roles

| Role | Flag | Can |
| --- | --- | --- |
| Superadmin | `profiles.is_superadmin` | Everything, plus **Team & access** (`/team`): approve or decline requests, remove admins. Set only in SQL by the database owner, so the owner can never be locked out. |
| Admin | `profiles.is_admin` | Everything except team management. Granted by approving a request; a superadmin can remove it any time (effective on their next request). |

Migration `202610230001_admin_roles.sql` adds `is_admin`, makes approvals grant admin, adds `humor_revoke_admin()` (superadmin-only, cannot touch superadmins, also closes their pending request) and logs grants/removals in the activity log. People who previously became superadmins through an approved request are converted to admins; whoever approved requests stays superadmin.

## Security model

* Every route except `/login`, `/denied` and `/auth/*` is behind Google sign-in **and** `profiles.is_superadmin = true` or `profiles.is_admin = true`; `/team` and its actions need `is_superadmin`.
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
2. Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (secret, never `NEXT_PUBLIC_`). For New post and Test run: `GEMINI_API_KEY`, and `OPENAI_API_KEY` if a chain uses OpenAI (secret). Optional: `ADMIN_AUTH_ORIGIN=https://<admin production domain>` so all aliases start OAuth on one host; `HUMOR_DATA_SCHEMA` (`public` default).
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
