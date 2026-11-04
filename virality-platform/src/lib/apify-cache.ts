// Cache for Apify results, so the same lookup isn't paid for twice.
//
// Stored in the app's document store (Supabase in production, ../data/*.json locally),
// collection "apify_cache". Key = actor + a stable hash of the actor input.
// Server-side only.

import { createHash } from "crypto";
import { getStore } from "./store";

const COLLECTION = "apify_cache";

const DAY = 24 * 60 * 60 * 1000;
// How long a saved Apify result is reused. The Refresh buttons (fresh=1) always fetch live data.
export const APIFY_CACHE_TTL = {
  /** keyword / hashtag searches: trends move fast */
  search: 3 * DAY,
  /** a creator's reels (Watchlist, pipeline): a reel gets most of its views in its first week */
  creator: 7 * DAY,
  /** Creators page stats (followers, reels and average views over 30 days): matches a weekly research routine */
  creatorStats: 7 * DAY,
  /** profile details (bio, picture, follower count for size tiers): rarely change */
  profile: 30 * DAY,
  /** reel transcripts never change */
  transcript: 30 * DAY,
} as const;

interface CacheDoc<T> {
  id: string;
  savedAt: string;
  data: T;
}

/** JSON with object keys sorted, so the same input always gives the same hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function apifyCacheKey(actor: string, input: unknown): string {
  const hash = createHash("sha256").update(stableStringify(input)).digest("hex").slice(0, 32);
  return `${actor.replace(/[^a-z0-9_~.-]/gi, "_")}:${hash}`;
}

export async function getCached<T>(key: string, maxAgeMs: number): Promise<T | null> {
  try {
    const doc = await getStore().get<CacheDoc<T>>(COLLECTION, key);
    if (doc && Date.now() - Date.parse(doc.savedAt) < maxAgeMs) {
      console.info(`[apify-cache] HIT ${key}`);
      return doc.data;
    }
  } catch (err) {
    console.warn(`[apify-cache] read failed for ${key}`, err);
  }
  console.info(`[apify-cache] MISS ${key}`);
  return null;
}

export async function setCached<T>(key: string, data: T, savedAt = new Date().toISOString()): Promise<void> {
  try {
    await getStore().upsert<CacheDoc<T>>(COLLECTION, { id: key, savedAt, data });
  } catch (err) {
    // A failed cache write must never break the request itself.
    console.warn(`[apify-cache] write failed for ${key}`, err);
  }
}

/** Empty or error-only results (Apify outages, missing profiles) are not worth remembering. */
function worthCaching(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.some((item) => !(item && typeof item === "object" && "error" in (item as Record<string, unknown>)));
  }
  if (typeof data === "string") return data.length > 0;
  return data !== null && data !== undefined;
}

/**
 * Run an Apify call through the cache, and say how old the result is.
 * `run` does the real request; it only happens on a miss or when `fresh` is true.
 */
export async function withApifyCacheMeta<T>(
  actor: string,
  input: unknown,
  opts: { maxAgeMs: number; fresh?: boolean },
  run: () => Promise<T>
): Promise<{ data: T; savedAt: string; fromCache: boolean }> {
  const key = apifyCacheKey(actor, input);
  if (!opts.fresh) {
    try {
      const doc = await getStore().get<CacheDoc<T>>(COLLECTION, key);
      if (doc && Date.now() - Date.parse(doc.savedAt) < opts.maxAgeMs) {
        console.info(`[apify-cache] HIT ${key}`);
        return { data: doc.data, savedAt: doc.savedAt, fromCache: true };
      }
    } catch (err) {
      console.warn(`[apify-cache] read failed for ${key}`, err);
    }
    console.info(`[apify-cache] MISS ${key}`);
  } else {
    console.info(`[apify-cache] FRESH ${key}`);
  }
  const data = await run();
  const savedAt = new Date().toISOString();
  if (worthCaching(data)) await setCached(key, data, savedAt);
  return { data, savedAt, fromCache: false };
}

/** Same as withApifyCacheMeta, returning only the data. */
export async function withApifyCache<T>(
  actor: string,
  input: unknown,
  opts: { maxAgeMs: number; fresh?: boolean },
  run: () => Promise<T>
): Promise<T> {
  return (await withApifyCacheMeta(actor, input, opts, run)).data;
}

/** `?fresh=1` or `{ fresh: true }` asks for live data, skipping the cache. */
export function wantsFresh(source: URLSearchParams | Record<string, unknown> | null | undefined): boolean {
  if (!source) return false;
  if (source instanceof URLSearchParams) return source.get("fresh") === "1" || source.get("fresh") === "true";
  return source.fresh === true || source.fresh === 1 || source.fresh === "1";
}
