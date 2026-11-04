# ViralOS (Virality Platform)

A short-form content workbench for beginner creators: find creators in your niche, learn why their videos went viral, turn that into hooks and scripts in your own voice, and track whether your own posts are working.

Built with Next.js 16 (App Router), React 19, Tailwind 4 and shadcn/ui. AI runs on Google Gemini; YouTube data comes from the YouTube Data API; Instagram data comes from Apify.

## Features

Sidebar groups: **Research**, **Create**, **Track**, **System**. A persona switcher sits at the top of the sidebar; every Create feature writes for the active persona.

| Area | Page | What it does |
|---|---|---|
| Create | **Persona** (`/persona`) | Who you are, your one audience avatar, 3–6 narrow topics, your voice and offer. Can draft a persona from a description, learn your voice from sample scripts, and warn when topics are too broad. |
| Research | **Discover Creators** (`/discover`) | Describe your niche → vetted YouTube and Instagram creators grouped by size tier, ad-driven channels filtered out, relevance-scored. Results are cached for 24h. Track creators to the Watchlist, or add them by profile URL. |
| Research | **Keyword Research** (`/keyword-research`) | Top Shorts/Reels for a keyword, ranked by virality score with paid-reach detection. **Analyze** a video for its hook, why it went viral, a scorecard, a reusable **hook formula** and **how it was filmed** (with a phone-only shot list). Save formulas to the Hook Library or write a script from the video. |
| Research | **Watchlist** (`/watchlist`) | Creators you track, per persona. Old browser-only watchlists are migrated automatically. |
| Create | **Hook Generator** (`/hook-generator`) | 15 hooks for a topic. With a persona active: 3 hooks from each of the 5 library structures that fit you. |
| Create | **Hook Library** (`/hook-library`) | 15 proven hook structures plus the formulas you saved. **Use** fills a structure in your voice and can send a hook to the Script Writer. |
| Create | **Script Writer** (`/script-writer`) | Guided 4 steps: Topic (from an analyzed video, a saved hook, or your own idea) → Research (with a verify-facts warning) → Hook (6 options inspired by real outliers from your latest search) → Script (timed beats, CTA, shot list, caption; Improve / Rewrite / Save / Download). Saved scripts and the original **Quick mode** form are tabs on the same page. |
| Track | **My Channel** (`/my-channel`) | Connect your public YouTube or Instagram account. Daily snapshots power KPI cards (followers, followers gained, views and posts in the last 7 days vs the 7 before), charts, and your recent posts ranked by virality score against your own average. |

AI research and generated scripts can be wrong. The app tells users to verify facts and numbers before posting, more strongly for finance, insurance, legal and health niches.

## Getting started

```bash
cd virality-platform
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Locally, put them in **`.env` in the repository root** (one level above `virality-platform/`). `next.config.ts` loads it. Copy [`../.env.example`](../.env.example) to start. Both `.env` and `.env.*` are git-ignored; keep `.env.example` free of real keys.

On Vercel, add the same variables in **Project → Settings → Environment Variables**.

| Var | Used by | Required |
|---|---|---|
| `GEMINI_API_KEY` | all AI features | yes |
| `GEMINI_MODEL` | main Gemini model. New API keys can't use `gemini-2.5-flash` (the code default), so set e.g. `gemini-3.5-flash` | recommended |
| `GEMINI_FALLBACK_MODEL` | tried when the main model is overloaded, e.g. `gemini-3.5-flash-lite` | optional |
| `YOUTUBE_API_KEY` | keyword research, discovery, My Channel | yes |
| `APIFY_API_TOKEN` | everything Instagram | yes, for Instagram |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | persistent storage | yes in production |
| `STORE_BACKEND` | set to `json` to force local files even when Supabase vars are set | optional |
| `CRON_SECRET` | protects the daily My Channel snapshot | yes, for the daily job |
| `APP_USERNAME`, `APP_PASSWORD` | the one login for the app; password at least 12 characters | yes |
| `AUTH_SECRET` | signs login sessions; at least 32 random characters | yes |

### Login

Every page and API route requires signing in (`/login`). There is one account, set by `APP_USERNAME` and `APP_PASSWORD`. Sessions are HMAC-signed, HTTP-only cookies that last 7 days; changing the username or password signs everyone out. After 5 wrong attempts from one IP, login is blocked for 15 minutes. If the variables are missing or too short, nobody can sign in. The daily cron is let through only with its `CRON_SECRET`.

## Storage

Personas, tracked creators, saved hooks, scripts, connected channels, snapshots and the discovery cache all go through `src/lib/store.ts` (collections: `personas`, `tracked_creators`, `saved_hooks`, `scripts`, `my_channels`, `channel_snapshots`, `discover_cache`).

- **Production (Vercel):** set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. It creates one `viralos_docs` table with row-level security on; the service role key is only used server-side.
- **Local:** with no Supabase vars, data is written to `../data/<collection>.json` (git-ignored). This does not persist on Vercel.
- `STORE_BACKEND=json` forces local files even when Supabase vars are present. On Windows, put it in `virality-platform/.env.local` rather than prefixing the command.

A few conveniences live only in the browser (localStorage): the active persona, recently analyzed videos and the latest search's top videos (used by the Script Writer). They don't sync across browsers or devices.

## Daily snapshots (My Channel)

[`vercel.json`](vercel.json) schedules a daily call at 09:00 UTC:

```json
{ "crons": [{ "path": "/api/my-channel/snapshot?all=1", "schedule": "0 9 * * *" }] }
```

1. Deploy with `virality-platform` as the Vercel project's root directory (that's where `vercel.json` lives).
2. Set `CRON_SECRET` to a long random string. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`; requests without it get `401`.
3. Make sure Supabase is set up, or snapshots won't persist.

The **Refresh now** button on My Channel takes a snapshot on demand. Trends and "followers gained" need snapshots on 2+ different days.

Instagram lookups through Apify can take one to two minutes, so these routes set `maxDuration = 300`. Check that your Vercel plan allows that function duration.

## Apify cache

Instagram data comes from Apify, which charges per result. To avoid paying twice for the same lookup, every Apify call except My Channel goes through `src/lib/apify-cache.ts`. Results are stored in the `apify_cache` collection (Supabase in production, `../data/apify_cache.json` locally).

| Call | Max results | Cached for |
|---|---|---|
| Keyword Research, Instagram (`/api/instagram`) | 100 | 3 days |
| Discover hashtag search | 60 per run | 3 days |
| Creator reels on the Watchlist (`/api/ig-profile`) | 200 | 15 days |
| Profile lookups (Discover, add creator) | 1 per profile | 15 days |
| Creator stats, last 30 days (`scrapeCreatorStats`) | 60, newer than 30 days | 15 days |
| Pipeline reels (`scrapeReels`) | 3 × max videos (60 to 150), newer than *n* days | 15 days |
| Reel transcript (`/api/ig-analyze`) | 1 | 30 days |
| My Channel snapshots | 1 profile + 20 reels | not cached (always live) |

- The cache key is the actor name plus a hash of its exact input, so a different hashtag, username or limit is a different entry.
- Empty or error-only results (Apify outages, missing profiles) are never cached.
- Saved results are older data: new posts and growing view counts show up only after a refresh. The Watchlist shows how old its reels are ("Saved copy from 3 days ago").
- Date filters use Apify's relative form (`"30 days"`), so the same request keeps the same cache key from day to day. The lengths live in `APIFY_CACHE_TTL` in `src/lib/apify-cache.ts`.
- **Force a refresh:** the Watchlist **Refresh** button and Discover's **Refresh** fetch live data. In the API, add `?fresh=1` (GET) or `{ "fresh": true }` (POST body), e.g. `/api/ig-profile?username=x&fresh=1`.
- The server log shows `[apify-cache] HIT`, `MISS` or `FRESH` with the key for each call.

## Cost and quota notes

- **YouTube Data API:** 10,000 units/day by default; `search` costs 100 units. A discovery run uses roughly 1,200+ units, so results are cached for 24h. My Channel uses the uploads playlist (about 3 units per snapshot).
- **Apify:** Instagram discovery is capped at about 25 profile lookups per run. Each My Channel Instagram snapshot is two actor runs. Other Instagram calls are cached (see **Apify cache**). If the monthly Apify limit is used up, the Watchlist says so; raise it at console.apify.com → Billing.
- **Gemini:** relevance scoring is batched into one call. Requests retry on overload (429/5xx) and then fall back to `GEMINI_FALLBACK_MODEL`.

## Project layout

```
src/
├── app/                    pages and API routes (app/api/*)
├── components/             UI (analysis-panel, hook-fill-panel, script/*, my-channel/*, persona/*, discover/*)
└── lib/
    ├── gemini-json.ts      Gemini JSON calls with retries, fallback and JSON salvage
    ├── store.ts            Supabase / JSON-file document store
    ├── persona.ts          persona helpers and personaToPromptBlock()
    ├── analysis-prompt.ts  viral analysis prompt (+ hook formula, visual playbook)
    ├── hook-library.ts     the 15 proven hook structures
    ├── script-flow.ts      guided script types, prompts and normalizers
    ├── discover.ts         creator discovery pipeline
    └── my-channel*.ts      own-channel snapshots and stats
```

Checks before committing: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
