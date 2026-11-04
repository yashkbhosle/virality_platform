// Cache for the Analyze button (Gemini analysis + transcript), so the same video
// isn't analyzed and paid for twice.
//
// Stored in the app's document store (Supabase in production, ../data/*.json locally),
// collection "analysis_cache". Key = platform + video id (YouTube id or Instagram shortcode).
// Server-side only.

import { createHash } from "crypto";
import { getStore } from "./store";

const COLLECTION = "analysis_cache";
const DAY = 24 * 60 * 60 * 1000;
/** A video's content never changes, so a saved analysis is reused for 30 days. Re-analyze forces a new one. */
export const ANALYSIS_CACHE_TTL = 30 * DAY;

interface AnalysisDoc<T> {
  id: string;
  savedAt: string;
  result: T;
}

/** Instagram reel/post shortcode from a URL, or a hash of the cleaned URL as a fallback. */
export function instagramAnalysisKey(url: string): string {
  const m = String(url || "").match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (m) return `instagram:${m[1]}`;
  const clean = String(url || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  return `instagram:url_${createHash("sha256").update(clean).digest("hex").slice(0, 24)}`;
}

export function youtubeAnalysisKey(videoId: string): string {
  return `youtube:${videoId}`;
}

/**
 * Run an analysis through the cache, and say how old the result is.
 * `run` does the real (paid) work; it only happens on a miss or when `fresh` is true.
 * Only successful results reach the cache: if `run` throws, nothing is saved.
 */
export async function withAnalysisCache<T>(
  key: string,
  opts: { fresh?: boolean; maxAgeMs?: number },
  run: () => Promise<T>
): Promise<{ result: T; savedAt: string; fromCache: boolean }> {
  const maxAgeMs = opts.maxAgeMs ?? ANALYSIS_CACHE_TTL;
  if (!opts.fresh) {
    try {
      const doc = await getStore().get<AnalysisDoc<T>>(COLLECTION, key);
      if (doc && Date.now() - Date.parse(doc.savedAt) < maxAgeMs) {
        console.info(`[analysis-cache] HIT ${key}`);
        return { result: doc.result, savedAt: doc.savedAt, fromCache: true };
      }
    } catch (err) {
      console.warn(`[analysis-cache] read failed for ${key}`, err);
    }
    console.info(`[analysis-cache] MISS ${key}`);
  } else {
    console.info(`[analysis-cache] FRESH ${key}`);
  }
  const result = await run();
  const savedAt = new Date().toISOString();
  try {
    await getStore().upsert<AnalysisDoc<T>>(COLLECTION, { id: key, savedAt, result });
  } catch (err) {
    // A failed cache write must never break the request itself.
    console.warn(`[analysis-cache] write failed for ${key}`, err);
  }
  return { result, savedAt, fromCache: false };
}
