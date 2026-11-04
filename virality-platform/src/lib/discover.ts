// F1: Niche → creator discovery pipeline (server-side only).
//
// 1. Gemini expands the niche into YouTube queries + Instagram hashtags.
// 2. YouTube: channel search + top recent Shorts search per query → batch channel stats.
// 3. Instagram: one Apify hashtag run → keep repeat/high-play owners → one Apify profile run (≤25).
// 4. One batched Gemini call scores niche relevance for every candidate.
// 5. Score, drop ad-driven channels, group by size tier.

import { geminiJSON } from "./gemini-json";
import { isLikelyAdDrivenChannel } from "./virality";
import {
  TIERS, creatorKey, formatCount, tierFor, tierLabel,
  type CreatorPlatform, type DiscoveredCreator, type DiscoverResult, type SizeTier,
} from "./creators-shared";

const YT_BASE = "https://www.googleapis.com/youtube/v3";
const APIFY_BASE = "https://api.apify.com/v2/acts";

export const DISCOVERY_LIMITS = {
  youtubeQueries: 6,
  instagramHashtags: 6,
  hashtagResultsLimit: 60,
  maxInstagramProfiles: 25,
  /** search.list costs 100 units; 2 searches per query */
  youtubeUnitsEstimate: 6 * 2 * 100 + 10,
  minRelevance: 0.35,
  perTier: 12,
};

// ── Small utilities ─────────────────────────────────────────────────────────

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

async function ytGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), key: env("YOUTUBE_API_KEY") });
  const res = await fetch(`${YT_BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`YouTube ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

async function apifyRun<T>(actor: string, input: Record<string, unknown>, timeoutSecs = 240): Promise<T[]> {
  const res = await fetch(
    `${APIFY_BASE}/${actor}/run-sync-get-dataset-items?token=${env("APIFY_API_TOKEN")}&timeout=${timeoutSecs}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
  );
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as T[]) : [];
}

function sixMonthsAgoISO() {
  return new Date(Date.now() - 182 * 86400000).toISOString();
}

// ── 1. Expand niche ─────────────────────────────────────────────────────────

export async function expandNiche(description: string): Promise<{ youtubeQueries: string[]; instagramHashtags: string[] }> {
  const prompt = `A beginner creator describes their niche:
"""${description}"""

Generate specific search queries/hashtags that creators in this niche use. Avoid generic tags like #viral #reels #fyp #explore #trending.
- youtubeQueries: exactly ${DISCOVERY_LIMITS.youtubeQueries} short YouTube search phrases (2–5 words) a creator in this niche would title their Shorts with.
- instagramHashtags: exactly ${DISCOVERY_LIMITS.instagramHashtags} niche hashtags WITHOUT the "#", lowercase, no spaces, that real creators in this niche actually use (mix medium-size and specific tags; include location tags only if the niche is local).

Return ONLY JSON: { "youtubeQueries": string[], "instagramHashtags": string[] }`;

  const raw = await geminiJSON<{ youtubeQueries?: unknown; instagramHashtags?: unknown }>({ prompt, temperature: 0.4, thinking: "minimal" });
  const clean = (v: unknown, n: number, tag = false) =>
    Array.from(
      new Set(
        (Array.isArray(v) ? v : [])
          .filter((x): x is string => typeof x === "string")
          .map((x) => (tag ? x.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase() : x.trim()))
          .filter(Boolean)
      )
    ).slice(0, n);
  const result = {
    youtubeQueries: clean(raw.youtubeQueries, DISCOVERY_LIMITS.youtubeQueries),
    instagramHashtags: clean(raw.instagramHashtags, DISCOVERY_LIMITS.instagramHashtags, true),
  };
  if (!result.youtubeQueries.length && !result.instagramHashtags.length) throw new Error("Niche expansion returned nothing");
  return result;
}

// ── Candidate shape before scoring ──────────────────────────────────────────

interface Candidate {
  platform: CreatorPlatform;
  handle: string;
  channelId?: string;
  name: string;
  thumbnail: string;
  url: string;
  followers: number;
  avgViewsPerVideo: number;
  /** text used for relevance scoring (title + description / bio + captions) */
  context: string;
  /** how many of their videos showed up in niche searches */
  appearances: number;
}

// ── 2. YouTube ──────────────────────────────────────────────────────────────

interface YTSearchItem { id?: { channelId?: string; videoId?: string }; snippet?: { channelId?: string } }
interface YTChannelItem {
  id: string;
  snippet?: { title?: string; description?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
}

export async function fetchYouTubeChannels(channelIds: string[]): Promise<YTChannelItem[]> {
  const out: YTChannelItem[] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const data = await ytGet<{ items?: YTChannelItem[] }>("channels", { part: "snippet,statistics", id: batch.join(","), maxResults: 50 });
    out.push(...(data.items ?? []));
  }
  return out;
}

export function youtubeChannelToCandidate(ch: YTChannelItem, appearances = 0): Candidate & { totalViews: number } {
  const subs = parseInt(ch.statistics?.subscriberCount ?? "0") || 0;
  const views = parseInt(ch.statistics?.viewCount ?? "0") || 0;
  const count = parseInt(ch.statistics?.videoCount ?? "0") || 0;
  const handle = ch.snippet?.customUrl?.replace(/^@/, "") || ch.id;
  const thumbs = ch.snippet?.thumbnails ?? {};
  return {
    platform: "youtube",
    handle,
    channelId: ch.id,
    name: ch.snippet?.title ?? handle,
    thumbnail: thumbs.medium?.url || thumbs.default?.url || thumbs.high?.url || "",
    url: ch.snippet?.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
    followers: ch.statistics?.hiddenSubscriberCount ? 0 : subs,
    avgViewsPerVideo: count > 0 ? Math.round(views / count) : 0,
    context: `${ch.snippet?.title ?? ""}. ${(ch.snippet?.description ?? "").slice(0, 300)}`,
    appearances,
    totalViews: views,
  };
}

async function discoverYouTube(queries: string[]): Promise<{ candidates: Candidate[]; excludedAdDriven: number }> {
  const appearances = new Map<string, number>();
  const bump = (id?: string, n = 1) => id && appearances.set(id, (appearances.get(id) ?? 0) + n);

  const searches = queries.flatMap((q) => [
    ytGet<{ items?: YTSearchItem[] }>("search", { part: "snippet", type: "channel", q, maxResults: 10 })
      .then((d) => d.items?.forEach((it) => bump(it.id?.channelId ?? it.snippet?.channelId, 0))),
    ytGet<{ items?: YTSearchItem[] }>("search", {
      part: "snippet", type: "video", videoDuration: "short", order: "viewCount", q, maxResults: 25, publishedAfter: sixMonthsAgoISO(),
    }).then((d) => d.items?.forEach((it) => bump(it.snippet?.channelId))),
  ]);
  const settled = await Promise.allSettled(searches);
  if (settled.every((s) => s.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }

  const channels = await fetchYouTubeChannels([...appearances.keys()]);
  let excludedAdDriven = 0;
  const candidates: Candidate[] = [];
  for (const ch of channels) {
    const c = youtubeChannelToCandidate(ch, appearances.get(ch.id) ?? 0);
    if (isLikelyAdDrivenChannel(c.followers, c.totalViews)) {
      excludedAdDriven++;
      continue;
    }
    candidates.push(c);
  }
  return { candidates, excludedAdDriven };
}

// ── 3. Instagram ────────────────────────────────────────────────────────────

interface IGPost {
  ownerUsername?: string;
  ownerFullName?: string;
  videoPlayCount?: number;
  videoViewCount?: number;
  caption?: string;
  type?: string;
  videoUrl?: string;
}
interface IGProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  latestPosts?: { type?: string; videoPlayCount?: number; videoViewCount?: number }[];
}

/** Average plays across the video posts in a profile's latest posts (0 if none). */
export function profileAvgPlays(p: IGProfile): number {
  const plays = (p.latestPosts ?? [])
    .map((x) => x.videoPlayCount ?? x.videoViewCount ?? 0)
    .filter((n) => n > 0);
  return plays.length ? Math.round(plays.reduce((s, n) => s + n, 0) / plays.length) : 0;
}

export async function fetchInstagramProfiles(usernames: string[]): Promise<IGProfile[]> {
  if (!usernames.length) return [];
  return apifyRun<IGProfile>("apify~instagram-scraper", {
    directUrls: usernames.map((u) => `https://www.instagram.com/${u}/`),
    resultsType: "details",
    resultsLimit: 1,
  });
}

async function discoverInstagram(hashtags: string[]): Promise<{ candidates: Candidate[]; belowNano: number }> {
  // "reels" mode returns video posts with play counts (plain "posts" is mostly images).
  const s = Date.now();
  const posts = await apifyRun<IGPost>("apify~instagram-hashtag-scraper", {
    hashtags,
    resultsLimit: DISCOVERY_LIMITS.hashtagResultsLimit,
    resultsType: "reels",
  });
  console.info(`[discover] instagram hashtags: ${posts.length} reels in ${((Date.now() - s) / 1000).toFixed(1)}s`);

  const owners = new Map<string, { count: number; plays: number[]; captions: string[]; fullName?: string }>();
  for (const p of posts) {
    const u = p.ownerUsername?.toLowerCase();
    if (!u) continue;
    const o = owners.get(u) ?? { count: 0, plays: [], captions: [] };
    o.count++;
    const plays = p.videoPlayCount ?? p.videoViewCount ?? 0;
    if (plays > 0) o.plays.push(plays);
    if (p.caption && o.captions.length < 2) o.captions.push(p.caption.slice(0, 160));
    if (p.ownerFullName) o.fullName = p.ownerFullName;
    owners.set(u, o);
  }

  const maxPlays = (o: { plays: number[] }) => Math.max(0, ...o.plays);
  const entries = [...owners.entries()];
  // Plan rule first: repeat posters or anyone with a 50K+ reel. Then fill the
  // remaining profile slots with the highest-play owners (≥5K plays), since most
  // single-post hashtag users are tiny accounts below the Nano tier.
  const primary = entries
    .filter(([, o]) => o.count >= 2 || maxPlays(o) > 50_000)
    .sort((a, b) => b[1].count - a[1].count || maxPlays(b[1]) - maxPlays(a[1]));
  const fill = entries
    .filter(([u, o]) => !primary.some(([p]) => p === u) && maxPlays(o) >= 5_000)
    .sort((a, b) => maxPlays(b[1]) - maxPlays(a[1]));
  const shortlisted = [...primary, ...fill].slice(0, DISCOVERY_LIMITS.maxInstagramProfiles);

  const profiles = await fetchInstagramProfiles(shortlisted.map(([u]) => u));
  const byName = new Map(profiles.filter((p) => p.username).map((p) => [p.username!.toLowerCase(), p]));

  const candidates: Candidate[] = [];
  let belowNano = 0;
  for (const [u, o] of shortlisted) {
    const prof = byName.get(u);
    if (!prof) continue;
    if (tierFor(prof.followersCount ?? 0) === null) belowNano++;
    // Prefer the profile's own latest reels; fall back to the reels found via hashtags.
    const hashtagAvg = o.plays.length ? Math.round(o.plays.reduce((s, x) => s + x, 0) / o.plays.length) : 0;
    const avg = profileAvgPlays(prof) || hashtagAvg;
    candidates.push({
      platform: "instagram",
      handle: prof.username ?? u,
      name: prof.fullName || o.fullName || u,
      thumbnail: prof.profilePicUrlHD || prof.profilePicUrl || "",
      url: `https://www.instagram.com/${prof.username ?? u}/`,
      followers: prof.followersCount ?? 0,
      avgViewsPerVideo: avg,
      context: `${prof.fullName ?? ""}. Bio: ${(prof.biography ?? "").slice(0, 200)}. Captions: ${o.captions.join(" | ")}`,
      appearances: o.count,
    });
  }
  return { candidates, belowNano };
}

// ── 4. Relevance (one batched call) ─────────────────────────────────────────

async function scoreRelevance(description: string, candidates: Candidate[]): Promise<Map<number, { relevance: number; about: string }>> {
  const result = new Map<number, { relevance: number; about: string }>();
  if (!candidates.length) return result;
  const list = candidates.map((c, i) => `${i}. [${c.platform}] ${c.context.replace(/\s+/g, " ").slice(0, 380)}`).join("\n");
  const prompt = `Niche: """${description}"""

Rate how closely each creator below matches this niche, as someone a beginner in the niche should study.
1.0 = clearly makes content on exactly this niche for the same audience; 0.5 = adjacent niche; 0 = unrelated, a brand/company ad account, news outlet, or meme page.
Also give "about": what they post about, 3–8 words, lowercase, no trailing period.

Creators:
${list}

Return ONLY JSON: { "scores": [ { "i": number, "relevance": number, "about": string } ] } with one entry per creator.`;

  const raw = await geminiJSON<{ scores?: { i?: unknown; relevance?: unknown; about?: unknown }[] }>({ prompt, temperature: 0.2, thinking: "minimal" });
  for (const s of raw.scores ?? []) {
    const i = typeof s.i === "number" ? s.i : Number(s.i);
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length) continue;
    const rel = typeof s.relevance === "number" ? s.relevance : Number(s.relevance);
    result.set(i, {
      relevance: Number.isFinite(rel) ? Math.max(0, Math.min(1, rel)) : 0,
      about: typeof s.about === "string" ? s.about.trim().replace(/\.$/, "").slice(0, 80) : "",
    });
  }
  return result;
}

// ── 5. Scoring ──────────────────────────────────────────────────────────────

function logNormalizer(values: number[]) {
  const logs = values.map((v) => Math.log10(Math.max(v, 0) + 1));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  return (v: number) => (max === min ? 0.5 : (Math.log10(Math.max(v, 0) + 1) - min) / (max - min));
}

export function buildWhy(c: { platform: CreatorPlatform; followers: number; avgViewsPerVideo: number; appearances?: number }, about?: string): string {
  const tier = tierFor(c.followers);
  const parts: string[] = [`${tierLabel(tier)} creator`];
  const vpf = c.followers > 0 ? c.avgViewsPerVideo / c.followers : 0;
  if (vpf >= 1.2) parts.push(`${vpf.toFixed(1)}× more views per video than followers`);
  else if (c.avgViewsPerVideo > 0) parts.push(`averages ${formatCount(c.avgViewsPerVideo)} views per ${c.platform === "youtube" ? "video" : "reel"}`);
  if ((c.appearances ?? 0) >= 2) parts.push(`${c.appearances} ${c.platform === "youtube" ? "Shorts" : "posts"} ranking in your niche searches`);
  if (about) parts.push(`posts about ${about}`);
  return parts.join(", ");
}

export function toDiscovered(c: Candidate, relevance: number | null, score: number, about?: string): DiscoveredCreator {
  return {
    key: creatorKey(c.platform, c.platform === "youtube" ? c.channelId ?? c.handle : c.handle),
    platform: c.platform,
    handle: c.handle,
    channelId: c.channelId,
    name: c.name,
    thumbnail: c.thumbnail,
    url: c.url,
    followers: c.followers,
    tier: tierFor(c.followers),
    avgViewsPerVideo: c.avgViewsPerVideo,
    viewsPerFollower: c.followers > 0 ? Math.round((c.avgViewsPerVideo / c.followers) * 100) / 100 : 0,
    relevance,
    discoveryScore: Math.round(score * 1000) / 1000,
    why: buildWhy(c, about),
  };
}

// ── Orchestration ───────────────────────────────────────────────────────────

export async function runDiscovery(description: string, platforms: CreatorPlatform[]): Promise<Omit<DiscoverResult, "fromCache" | "cachedAt">> {
  const notes: string[] = [];
  const t0 = Date.now();
  const lap = (label: string, since: number) => console.info(`[discover] ${label}: ${((Date.now() - since) / 1000).toFixed(1)}s`);
  const queries = await expandNiche(description);
  lap("expand niche", t0);

  const timed = <T,>(label: string, p: Promise<T>) => {
    const s = Date.now();
    return p.finally(() => lap(label, s));
  };
  const [yt, ig] = await Promise.allSettled([
    platforms.includes("youtube") && queries.youtubeQueries.length ? timed("youtube", discoverYouTube(queries.youtubeQueries)) : Promise.resolve(null),
    platforms.includes("instagram") && queries.instagramHashtags.length ? timed("instagram", discoverInstagram(queries.instagramHashtags)) : Promise.resolve(null),
  ]);

  let candidates: Candidate[] = [];
  let excludedAdDriven = 0;
  if (yt.status === "fulfilled" && yt.value) {
    candidates.push(...yt.value.candidates);
    excludedAdDriven = yt.value.excludedAdDriven;
  } else if (yt.status === "rejected") {
    console.error("[discover] youtube failed", yt.reason);
    notes.push("YouTube search failed (the daily API quota may be used up). Showing other platforms only.");
  }
  if (ig.status === "fulfilled" && ig.value) {
    candidates.push(...ig.value.candidates);
    const usable = ig.value.candidates.length - ig.value.belowNano;
    if (usable === 0) {
      notes.push(
        ig.value.candidates.length
          ? "The Instagram accounts using these hashtags are all under 1K followers, so none are shown."
          : "No Instagram reels were found for these hashtags."
      );
    }
  } else if (ig.status === "rejected") {
    console.error("[discover] instagram failed", ig.reason);
    notes.push("Instagram search failed. Showing other platforms only.");
  }
  if (yt.status === "rejected" && ig.status === "rejected") throw new Error("All platform searches failed");

  // Only creators in a size tier (≥1K followers) can be studied meaningfully.
  candidates = candidates.filter((c) => tierFor(c.followers) !== null);

  let relevance = new Map<number, { relevance: number; about: string }>();
  try {
    const s = Date.now();
    relevance = await scoreRelevance(description, candidates);
    lap(`relevance (${candidates.length} candidates)`, s);
  } catch (err) {
    console.error("[discover] relevance scoring failed", err);
    notes.push("Couldn't rate niche relevance this time, so results are ranked by performance only.");
  }

  const normVpf = logNormalizer(candidates.map((c) => (c.followers > 0 ? c.avgViewsPerVideo / c.followers : 0)));
  const normAvg = logNormalizer(candidates.map((c) => c.avgViewsPerVideo));

  const scored: DiscoveredCreator[] = [];
  candidates.forEach((c, i) => {
    const r = relevance.get(i);
    const rel = relevance.size ? r?.relevance ?? 0 : 0.5;
    if (relevance.size && rel < DISCOVERY_LIMITS.minRelevance) return;
    const vpf = c.followers > 0 ? c.avgViewsPerVideo / c.followers : 0;
    const score = 0.5 * rel + 0.3 * normVpf(vpf) + 0.2 * normAvg(c.avgViewsPerVideo);
    scored.push(toDiscovered(c, relevance.size ? rel : null, score, r?.about));
  });

  const tiers = TIERS.map((t) => ({
    tier: t.id,
    creators: scored.filter((c) => c.tier === t.id).sort((a, b) => b.discoveryScore - a.discoveryScore).slice(0, DISCOVERY_LIMITS.perTier),
  }));

  return { tiers, queries, notes, excludedAdDriven };
}

export function filterTiers(result: DiscoverResult, tiers: SizeTier[]): DiscoverResult {
  const want = new Set(tiers.length ? tiers : TIERS.map((t) => t.id));
  return { ...result, tiers: result.tiers.filter((t) => want.has(t.tier)) };
}
