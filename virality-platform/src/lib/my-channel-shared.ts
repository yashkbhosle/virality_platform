// F7: Own-channel tracking — types and pure stats helpers (client + server safe).
import { computeViralityMetrics, type ViralityMetrics } from "./virality";

export const MY_CHANNELS = "my_channels";
export const CHANNEL_SNAPSHOTS = "channel_snapshots";
export const RECENT_POSTS = 20;

export type MyPlatform = "youtube" | "instagram";

export interface MyChannel {
  id: string;
  personaId: string;
  platform: MyPlatform;
  handle: string;
  channelId?: string;
  title?: string;
  thumbnail?: string;
  addedAt: string;
}

export interface ChannelPost {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
}

export interface ChannelSnapshot {
  id: string;
  channelId: string; // MyChannel.id
  takenAt: string;
  followers: number;
  totalViews: number | null; // YouTube lifetime views; Instagram doesn't expose this
  postCount: number;
  recentPosts: ChannelPost[];
}

/** Snapshot without the posts, for history charts. */
export type SnapshotPoint = Omit<ChannelSnapshot, "recentPosts">;

export interface ChannelWithData {
  channel: MyChannel;
  latest: ChannelSnapshot | null;
  history: SnapshotPoint[];
}

export interface RankedPost extends ChannelPost {
  metrics: ViralityMetrics;
}

const DAY = 86_400_000;

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Last snapshot of each calendar day (UTC), oldest first. */
export function dailyPoints(history: SnapshotPoint[]): SnapshotPoint[] {
  const byDay = new Map<string, SnapshotPoint>();
  for (const s of [...history].sort((a, b) => a.takenAt.localeCompare(b.takenAt))) byDay.set(dayKey(s.takenAt), s);
  return [...byDay.values()];
}

/** Value of the latest snapshot at or before `t`, or null. */
function followersAt(points: SnapshotPoint[], t: number): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (new Date(p.takenAt).getTime() <= t) v = p.followers;
  }
  return v;
}

export interface Kpi {
  value: number | null;
  previous: number | null; // same metric for the 7 days before
  changePct: number | null;
}

function kpi(value: number | null, previous: number | null): Kpi {
  const changePct = value !== null && previous !== null && previous !== 0 ? ((value - previous) / Math.abs(previous)) * 100 : null;
  return { value, previous, changePct };
}

function postsBetween(posts: ChannelPost[], from: number, to: number) {
  return posts.filter((p) => {
    const t = new Date(p.publishedAt).getTime();
    return t > from && t <= to;
  });
}

export interface ChannelKpis {
  followers: Kpi;
  followersGained7d: Kpi;
  views7d: Kpi; // views on posts published in the window
  posts7d: Kpi;
}

export function computeKpis(data: ChannelWithData, now = Date.now()): ChannelKpis {
  const points = dailyPoints(data.history);
  const latest = data.latest;
  const posts = latest?.recentPosts ?? [];

  const f0 = latest?.followers ?? null;
  const f7 = followersAt(points, now - 7 * DAY);
  const f14 = followersAt(points, now - 14 * DAY);
  const gained = f0 !== null && f7 !== null ? f0 - f7 : null;
  const gainedPrev = f7 !== null && f14 !== null ? f7 - f14 : null;
  const followersPrev = f7;

  const cur = postsBetween(posts, now - 7 * DAY, now);
  const prev = postsBetween(posts, now - 14 * DAY, now - 7 * DAY);
  // If the oldest tracked post is newer than 14 days, the previous window may be incomplete.
  const oldest = posts.reduce((m, p) => Math.min(m, new Date(p.publishedAt).getTime()), now);
  const prevComplete = posts.length < RECENT_POSTS || oldest <= now - 14 * DAY;

  const sumViews = (list: ChannelPost[]) => list.reduce((s, p) => s + p.views, 0);
  return {
    followers: kpi(f0, followersPrev),
    followersGained7d: kpi(gained, gainedPrev),
    views7d: kpi(latest ? sumViews(cur) : null, latest && prevComplete ? sumViews(prev) : null),
    posts7d: kpi(latest ? cur.length : null, latest && prevComplete ? prev.length : null),
  };
}

/** Views by publish day for the last `days` days (from the latest snapshot's posts). */
export function viewsByDay(posts: ChannelPost[], days = 30, now = Date.now()): { day: string; value: number }[] {
  const out: { day: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayKey(new Date(now - i * DAY).toISOString());
    out.push({ day: d, value: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.day, i]));
  for (const p of posts) {
    const i = idx.get(dayKey(p.publishedAt));
    if (i !== undefined) out[i].value += p.views;
  }
  return out;
}

export function followerSeries(history: SnapshotPoint[]): { day: string; followers: number; gained: number | null }[] {
  const points = dailyPoints(history);
  return points.map((p, i) => ({
    day: dayKey(p.takenAt),
    followers: p.followers,
    gained: i === 0 ? null : p.followers - points[i - 1].followers,
  }));
}

/** Posts ranked by virality score, with outliers measured against the creator's own average. */
export function rankPosts(snapshot: ChannelSnapshot | null): { posts: RankedPost[]; avgViews: number } {
  const posts = snapshot?.recentPosts ?? [];
  const withViews = posts.filter((p) => p.views > 0);
  const avgViews = withViews.length ? withViews.reduce((s, p) => s + p.views, 0) / withViews.length : 0;
  const ranked = posts
    .map((p) => ({
      ...p,
      metrics: computeViralityMetrics({ views: p.views, likes: p.likes, comments: p.comments, followers: snapshot?.followers, baselineViews: avgViews || null }),
    }))
    .sort((a, b) => b.metrics.viralityScore - a.metrics.viralityScore || b.views - a.views);
  return { posts: ranked, avgViews };
}

/** Best post published in the last 30 days by outlier score vs. the creator's own average. */
export function bestRecentPost(ranked: RankedPost[], now = Date.now()): RankedPost | null {
  const recent = ranked.filter((p) => new Date(p.publishedAt).getTime() >= now - 30 * DAY && (p.metrics.outlierScore ?? 0) > 0);
  if (!recent.length) return null;
  return recent.reduce((best, p) => ((p.metrics.outlierScore ?? 0) > (best.metrics.outlierScore ?? 0) ? p : best));
}

/** Parse what the user typed into a platform + handle or channel id. */
export function parseChannelInput(platform: MyPlatform, raw: string): { handle?: string; channelId?: string } | null {
  const s = raw.trim();
  if (!s) return null;
  if (platform === "youtube") {
    const url = s.match(/youtube\.com\/(?:(@[\w.\-]+)|channel\/(UC[\w-]{20,})|c\/([\w.\-]+)|user\/([\w.\-]+))/i);
    if (url) return url[2] ? { channelId: url[2] } : { handle: (url[1] || url[3] || url[4]).replace(/^@/, "") };
    if (/^UC[\w-]{20,}$/.test(s)) return { channelId: s };
    const h = s.replace(/^@/, "");
    return /^[\w.\-]{3,100}$/.test(h) ? { handle: h } : null;
  }
  const url = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const h = (url ? url[1] : s).replace(/^@/, "");
  if (["p", "reel", "reels", "explore", "stories"].includes(h.toLowerCase())) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? { handle: h.toLowerCase() } : null;
}
