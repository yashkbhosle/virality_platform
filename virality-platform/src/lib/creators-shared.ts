// Types and helpers shared by the discovery pipeline, tracked-creators API and pages.
// No server-only imports here.

export type CreatorPlatform = "youtube" | "instagram";

export type SizeTier = "nano" | "micro" | "small" | "medium" | "large";

export const TIERS: { id: SizeTier; label: string; min: number; max: number; range: string }[] = [
  { id: "nano", label: "Nano", min: 1_000, max: 10_000, range: "1K – 10K" },
  { id: "micro", label: "Micro", min: 10_000, max: 50_000, range: "10K – 50K" },
  { id: "small", label: "Small", min: 50_000, max: 250_000, range: "50K – 250K" },
  { id: "medium", label: "Medium", min: 250_000, max: 1_000_000, range: "250K – 1M" },
  { id: "large", label: "Large", min: 1_000_000, max: Infinity, range: "1M+" },
];

export const DEFAULT_TIERS: SizeTier[] = ["micro", "small"];

/** Size tier for a follower count, or null when below 1K (too small to study). */
export function tierFor(followers: number): SizeTier | null {
  for (const t of TIERS) if (followers >= t.min && followers < t.max) return t.id;
  return null;
}

export function tierLabel(tier: SizeTier | null | undefined): string {
  return TIERS.find((t) => t.id === tier)?.label ?? "Under 1K";
}

export interface DiscoveredCreator {
  /** Stable key: "<platform>:<handle or channelId>" (lowercase) */
  key: string;
  platform: CreatorPlatform;
  handle: string; // without "@"; YouTube may fall back to the channel id
  channelId?: string;
  name: string;
  thumbnail: string;
  url: string;
  followers: number;
  tier: SizeTier | null;
  avgViewsPerVideo: number;
  /** avgViewsPerVideo ÷ followers */
  viewsPerFollower: number;
  /** 0–1 niche match from Gemini (null for creators added by URL) */
  relevance: number | null;
  discoveryScore: number;
  /** One plain-language line on why this creator is worth studying */
  why: string;
}

export interface DiscoverResult {
  tiers: { tier: SizeTier; creators: DiscoveredCreator[] }[];
  queries: { youtubeQueries: string[]; instagramHashtags: string[] };
  fromCache: boolean;
  cachedAt: string;
  /** Friendly notes, e.g. "Instagram search failed, showing YouTube only" */
  notes: string[];
  excludedAdDriven: number;
}

export interface TrackedCreator {
  id: string; // same as DiscoveredCreator.key
  platform: CreatorPlatform;
  handle: string;
  channelId?: string;
  name: string;
  followers: number;
  tier: SizeTier | null;
  personaId?: string;
  thumbnail?: string;
  url?: string;
  addedAt: string;
}

export function creatorKey(platform: CreatorPlatform, handleOrId: string): string {
  return `${platform}:${handleOrId.replace(/^@/, "").trim().toLowerCase()}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

/** Parse pasted profile URLs / handles (one per line). */
export function parseProfileUrls(text: string): { platform: CreatorPlatform; handle?: string; channelId?: string; raw: string }[] {
  const out: { platform: CreatorPlatform; handle?: string; channelId?: string; raw: string }[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    let item: { platform: CreatorPlatform; handle?: string; channelId?: string; raw: string } | null = null;

    const yt = raw.match(/youtube\.com\/(?:(@[\w.\-]+)|channel\/(UC[\w-]{20,})|c\/([\w.\-]+)|user\/([\w.\-]+))/i);
    const ig = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if (yt) {
      if (yt[2]) item = { platform: "youtube", channelId: yt[2], raw };
      else item = { platform: "youtube", handle: (yt[1] || yt[3] || yt[4]).replace(/^@/, ""), raw };
    } else if (ig && !["p", "reel", "reels", "explore", "stories"].includes(ig[1].toLowerCase())) {
      item = { platform: "instagram", handle: ig[1], raw };
    }
    if (!item) continue;
    const k = creatorKey(item.platform, item.channelId ?? item.handle ?? "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
