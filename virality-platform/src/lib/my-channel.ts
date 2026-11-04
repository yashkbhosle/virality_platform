// F7: Own-channel tracking — server-side lookups and snapshots (public data only).
import { apifyRun, ytGet } from "./discover";
import { getStore } from "./store";
import {
  CHANNEL_SNAPSHOTS, MY_CHANNELS, RECENT_POSTS,
  type ChannelPost, type ChannelSnapshot, type ChannelWithData, type MyChannel, type MyPlatform,
} from "./my-channel-shared";

export class ChannelNotFoundError extends Error {}

// ── YouTube ─────────────────────────────────────────────────────────────────

interface YTChannel {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}
interface YTVideo {
  id: string;
  snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

const num = (v: unknown) => Number(v) || 0;
const thumb = (t?: Record<string, { url?: string }>) => t?.medium?.url ?? t?.high?.url ?? t?.default?.url;

async function ytChannel(q: { handle?: string; channelId?: string }): Promise<YTChannel> {
  const params: Record<string, string> = { part: "snippet,statistics,contentDetails" };
  if (q.channelId) params.id = q.channelId;
  else params.forHandle = `@${q.handle}`;
  const data = await ytGet<{ items?: YTChannel[] }>("channels", params);
  const ch = data.items?.[0];
  if (!ch) throw new ChannelNotFoundError("We couldn't find that YouTube channel. Check the @handle.");
  return ch;
}

async function youtubeSnapshot(ch: YTChannel): Promise<Omit<ChannelSnapshot, "id" | "channelId" | "takenAt">> {
  // The uploads playlist costs 1 quota unit (search would cost 100).
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  let posts: ChannelPost[] = [];
  if (uploads) {
    const items = await ytGet<{ items?: { contentDetails?: { videoId?: string } }[] }>("playlistItems", {
      part: "contentDetails", playlistId: uploads, maxResults: RECENT_POSTS,
    }).catch(() => ({ items: [] }));
    const ids = (items.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x);
    if (ids.length) {
      const vids = await ytGet<{ items?: YTVideo[] }>("videos", { part: "snippet,statistics", id: ids.join(","), maxResults: 50 });
      posts = (vids.items ?? []).map((v) => ({
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet?.title ?? "",
        thumbnail: thumb(v.snippet?.thumbnails),
        publishedAt: v.snippet?.publishedAt ?? "",
        views: num(v.statistics?.viewCount),
        likes: num(v.statistics?.likeCount),
        comments: num(v.statistics?.commentCount),
      }));
    }
  }
  return {
    followers: num(ch.statistics?.subscriberCount),
    totalViews: num(ch.statistics?.viewCount),
    postCount: num(ch.statistics?.videoCount),
    recentPosts: posts,
  };
}

// ── Instagram ───────────────────────────────────────────────────────────────

interface IGPostRaw {
  error?: string;
  id?: string; shortCode?: string; url?: string; caption?: string; displayUrl?: string; timestamp?: string;
  type?: string; videoUrl?: string; videoPlayCount?: number; videoViewCount?: number; likesCount?: number; commentsCount?: number;
}
interface IGProfileRaw {
  username?: string; fullName?: string; profilePicUrl?: string; followersCount?: number; postsCount?: number;
  latestPosts?: IGPostRaw[];
  error?: string; // Apify returns { error: "not_found" } items for missing/private profiles
}

function igPost(p: IGPostRaw): ChannelPost | null {
  const id = p.shortCode || p.id;
  if (!id || !p.timestamp) return null;
  return {
    id,
    url: p.url || `https://www.instagram.com/reel/${p.shortCode ?? id}/`,
    title: (p.caption ?? "").split("\n")[0].slice(0, 140) || "Reel",
    thumbnail: p.displayUrl,
    publishedAt: p.timestamp,
    views: num(p.videoPlayCount ?? p.videoViewCount),
    likes: Math.max(0, num(p.likesCount)), // hidden like counts come back as -1
    comments: num(p.commentsCount),
  };
}

async function instagramProfile(username: string): Promise<IGProfileRaw> {
  const [profile] = await apifyRun<IGProfileRaw>("apify~instagram-scraper", {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: "details",
    resultsLimit: 1,
  });
  if (!profile || !profile.username || profile.error) throw new ChannelNotFoundError("We couldn't load that Instagram account. Check the username and that it's public. If it is, Instagram may be blocking lookups right now, so try again later.");
  return profile;
}

async function instagramSnapshot(username: string, profile?: IGProfileRaw) {
  const [p, reels] = await Promise.all([
    profile ? Promise.resolve(profile) : instagramProfile(username),
    apifyRun<IGPostRaw>("apify~instagram-scraper", {
      directUrls: [`https://www.instagram.com/${username}/reels/`],
      resultsType: "posts",
      resultsLimit: RECENT_POSTS,
      isUserReelFeedURL: true,
      addParentData: false,
    }).catch((err) => {
      console.error("[my-channel] instagram reels failed", err);
      return [] as IGPostRaw[];
    }),
  ]);
  // Fall back to the video posts in the profile's latest posts if the reels feed came back empty.
  const okReels = reels.filter((r) => !r.error);
  const source = okReels.length ? okReels : (p.latestPosts ?? []).filter((x) => x.type === "Video" || x.videoUrl);
  const posts = source.map(igPost).filter((x): x is ChannelPost => !!x).slice(0, RECENT_POSTS);
  return {
    profile: p,
    data: { followers: num(p.followersCount), totalViews: null, postCount: num(p.postsCount), recentPosts: posts },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Looks the account up and takes the first snapshot. */
export async function connectChannel(input: {
  personaId: string; platform: MyPlatform; handle?: string; channelId?: string;
}): Promise<{ channel: MyChannel; snapshot: ChannelSnapshot }> {
  const store = getStore();
  const now = new Date().toISOString();
  let channel: MyChannel;
  let snap: Omit<ChannelSnapshot, "id" | "channelId" | "takenAt">;

  if (input.platform === "youtube") {
    const ch = await ytChannel(input);
    channel = {
      id: `youtube-${ch.id}`,
      personaId: input.personaId,
      platform: "youtube",
      handle: ch.snippet?.customUrl?.replace(/^@/, "") ?? input.handle ?? ch.id,
      channelId: ch.id,
      title: ch.snippet?.title,
      thumbnail: thumb(ch.snippet?.thumbnails),
      addedAt: now,
    };
    snap = await youtubeSnapshot(ch);
  } else {
    const username = (input.handle ?? "").toLowerCase();
    const profile = await instagramProfile(username);
    const { data } = await instagramSnapshot(username, profile);
    channel = {
      id: `instagram-${username}`,
      personaId: input.personaId,
      platform: "instagram",
      handle: username,
      title: profile.fullName || `@${username}`,
      thumbnail: profile.profilePicUrl,
      addedAt: now,
    };
    snap = data;
  }

  const existing = await store.get<MyChannel>(MY_CHANNELS, channel.id);
  if (existing) channel = { ...channel, addedAt: existing.addedAt };
  await store.upsert(MY_CHANNELS, channel);
  const snapshot: ChannelSnapshot = { id: `${channel.id}-${now}`, channelId: channel.id, takenAt: now, ...snap };
  await store.upsert(CHANNEL_SNAPSHOTS, snapshot);
  return { channel, snapshot };
}

export async function takeSnapshot(channel: MyChannel): Promise<ChannelSnapshot> {
  const now = new Date().toISOString();
  const data =
    channel.platform === "youtube"
      ? await youtubeSnapshot(await ytChannel({ channelId: channel.channelId, handle: channel.handle }))
      : (await instagramSnapshot(channel.handle)).data;
  const snapshot: ChannelSnapshot = { id: `${channel.id}-${now}`, channelId: channel.id, takenAt: now, ...data };
  await getStore().upsert(CHANNEL_SNAPSHOTS, snapshot);
  return snapshot;
}

/** Channels (optionally for one persona) with their latest full snapshot and a compact history. */
export async function loadChannelsWithData(personaId?: string): Promise<ChannelWithData[]> {
  const store = getStore();
  const [channels, snapshots] = await Promise.all([
    store.list<MyChannel>(MY_CHANNELS),
    store.list<ChannelSnapshot>(CHANNEL_SNAPSHOTS),
  ]);
  return channels
    .filter((c) => !personaId || c.personaId === personaId)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map((channel) => {
      const mine = snapshots.filter((s) => s.channelId === channel.id).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
      const latest = mine.at(-1) ?? null;
      const history = mine.map((s) => ({ id: s.id, channelId: s.channelId, takenAt: s.takenAt, followers: s.followers, totalViews: s.totalViews, postCount: s.postCount }));
      return { channel, latest, history };
    });
}

export async function removeChannel(id: string) {
  const store = getStore();
  const snaps = (await store.list<ChannelSnapshot>(CHANNEL_SNAPSHOTS)).filter((s) => s.channelId === id);
  for (const s of snaps) await store.remove(CHANNEL_SNAPSHOTS, s.id);
  await store.remove(MY_CHANNELS, id);
}
