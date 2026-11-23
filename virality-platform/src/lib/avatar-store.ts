// Saved profile pictures for tracked creators.
//
// Instagram picture links (cdninstagram.com) stop working after a few days, so the
// image itself is downloaded once, while its link still works, and kept in the store
// (collection "creator_avatars", one small document per creator). Pages show it through
// /api/avatar?id=<platform:handle>. Server-side only.

import { getStore } from "./store";

const COLLECTION = "creator_avatars";
const MAX_BYTES = 400 * 1024; // profile pictures are ~10-80 KB; refuse anything bigger
// Plain photo formats only (no SVG, which could carry scripts).
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_HOSTS = [/(^|\.)cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i, /(^|\.)ggpht\.com$/i, /(^|\.)googleusercontent\.com$/i, /(^|\.)ytimg\.com$/i];

export interface SavedAvatar {
  id: string; // same key as the tracked creator, e.g. "instagram:natgeo"
  contentType: string;
  data: string; // base64
  sourceUrl: string;
  savedAt: string;
}

/** Only download from the image hosts Instagram and YouTube use. */
function allowedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return ALLOWED_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

export async function getAvatar(id: string): Promise<SavedAvatar | null> {
  return getStore().get<SavedAvatar>(COLLECTION, id);
}

/**
 * Download a profile picture and save it under `id`. Returns when it was saved
 * (ISO time, also used to refresh the browser cache), or null when it could not be.
 * Never throws: a missing picture must not break adding a creator.
 */
export async function saveAvatarFromUrl(id: string, url: string | undefined | null): Promise<string | null> {
  if (!id || !url) return null;
  const u = allowedUrl(url);
  if (!u) return null;
  try {
    const existing = await getAvatar(id);
    if (existing?.sourceUrl === url) return existing.savedAt; // already have this exact picture

    const res = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!res.ok || !IMAGE_TYPES.has(contentType)) {
      console.warn(`[avatar] ${id}: picture link didn't work (${res.status})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;

    const savedAt = new Date().toISOString();
    await getStore().upsert<SavedAvatar>(COLLECTION, { id, contentType, data: buf.toString("base64"), sourceUrl: url, savedAt });
    return savedAt;
  } catch (err) {
    console.warn(`[avatar] ${id}: couldn't save picture`, err);
    return null;
  }
}

export function deleteAvatar(id: string): Promise<void> {
  return getStore().remove(COLLECTION, id);
}
