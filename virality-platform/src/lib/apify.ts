import { APIFY_CACHE_TTL, withApifyCache } from "./apify-cache";

export interface IGReel {
  id: string;
  url: string;
  thumbnail: string;
  caption: string;
  ownerUsername: string;
  ownerProfilePic: string;
  plays: number;
  likes: number;
  comments: number;
  timestamp: string;
}

export interface ApifyReel {
  videoUrl: string;
  url: string;
  videoPlayCount: number;
  likesCount: number;
  commentsCount: number;
  ownerUsername: string;
  images: string[];
  timestamp: string;
}

interface ApifyProfileResult {
  profilePicUrl: string;
  followersCount: number;
}

export interface CreatorStats {
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
}

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");
  return token;
}

export async function searchInstagramReels(keyword: string, maxResults = 20, period = "all"): Promise<IGReel[]> {
  const token = getToken();
  const tag = keyword.trim().split(/\s+/)[0].toLowerCase();
  const days: Record<string, number> = { "14d": 14, "30d": 30, "6mo": 180, "1y": 365, "2y": 730 };

  const body: Record<string, unknown> = {
    hashtags: [tag],
    resultsLimit: 100,
    resultsType: "posts",
  };
  if (period !== "all" && days[period]) {
    body.onlyPostsNewerThan = new Date(Date.now() - days[period] * 86400000).toISOString().slice(0, 10);
  }

  const data = await withApifyCache("apify~instagram-hashtag-scraper", body, { maxAgeMs: APIFY_CACHE_TTL.search }, async () => {
    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!response.ok) throw new Error(`Apify error ${response.status}: ${await response.text()}`);
    return await response.json() as any[];
  });

  // Prefer video posts; fall back to all posts if none detected
  const videos = data.filter((item: any) => !!item.videoUrl);
  const source = videos.length >= 3 ? videos : data;

  // Primary sort key: actual videoPlayCount. Fallback: engagement proxy.
  const score = (item: any) => {
    const plays = item.videoPlayCount || 0;
    return plays > 0 ? plays : (item.likesCount || 0) * 50 + (item.commentsCount || 0) * 200;
  };

  return source
    .sort((a: any, b: any) => score(b) - score(a))
    .slice(0, maxResults)
    .map((item: any) => ({
      id: item.id || item.shortCode || "",
      url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
      thumbnail: item.displayUrl || item.thumbnailUrl || "",
      caption: (item.caption || "").slice(0, 200),
      ownerUsername: item.ownerUsername || item.owner?.username || "",
      ownerProfilePic: item.ownerProfilePicUrl || "",
      plays: item.videoPlayCount || 0,
      likes: item.likesCount || 0,
      comments: item.commentsCount || 0,
      timestamp: item.timestamp || "",
    }));
}

export async function scrapeReels(
  username: string,
  maxVideos: number,
  nDays: number,
  opts: { fresh?: boolean } = {}
): Promise<ApifyReel[]> {
  const token = getToken();
  const input = {
    directUrls: [`https://www.instagram.com/${username}/reels/`],
    resultsType: "posts",
    // Enough headroom to rank by views, without paying for hundreds of old reels.
    resultsLimit: Math.min(Math.max(maxVideos * 3, 60), 150),
    // Only reels from the last nDays. Relative form ("30 days") keeps the cache key the same from day to day.
    onlyPostsNewerThan: `${Math.max(1, Math.round(nDays))} days`,
    isUserReelFeedURL: true,
    addParentData: false,
    timeoutSecs: 180,
  };

  const data = await withApifyCache("apify~instagram-scraper", input, { maxAgeMs: APIFY_CACHE_TTL.creator, fresh: opts.fresh }, async () => {
    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Apify error ${response.status}: ${text}`);
    }
    return await response.json() as ApifyReel[];
  });

  // Safety net: the date filter is applied in code too.
  const cutoff = Date.now() - nDays * 86400000;
  return data
    .filter((item) => !!item.videoUrl && (!item.timestamp || Date.parse(item.timestamp) >= cutoff))
    .sort((a, b) => (b.videoPlayCount || 0) - (a.videoPlayCount || 0))
    .slice(0, maxVideos);
}

export async function scrapeCreatorStats(username: string, opts: { fresh?: boolean } = {}): Promise<CreatorStats> {
  const token = getToken();
  const cache = { maxAgeMs: APIFY_CACHE_TTL.creator, fresh: opts.fresh };

  // 1. Get profile info (details mode)
  const profileInput = {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: "details",
    resultsLimit: 1,
  };
  const profileData = await withApifyCache("apify~instagram-scraper", profileInput, cache, async () => {
    const profileRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profileInput) }
    );
    if (!profileRes.ok) {
      const text = await profileRes.text();
      throw new Error(`Apify profile error ${profileRes.status}: ${text}`);
    }
    return await profileRes.json() as ApifyProfileResult[];
  });
  const profile = profileData[0] || {};
  const profilePicUrl = profile.profilePicUrl || "";
  const followers = profile.followersCount || 0;

  // 2. Get recent posts to compute activity metrics (only the last 30 days are used)
  const postsInput = {
    directUrls: [`https://www.instagram.com/${username}/reels/`],
    resultsType: "posts",
    resultsLimit: 60,
    // Relative form keeps the cache key stable across days; the in-code 30-day filter below stays exact.
    onlyPostsNewerThan: "30 days",
    isUserReelFeedURL: true,
    addParentData: false,
    timeoutSecs: 180,
  };
  const posts = await withApifyCache("apify~instagram-scraper", postsInput, cache, async () => {
    const postsRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postsInput) }
    );
    if (!postsRes.ok) {
      const text = await postsRes.text();
      throw new Error(`Apify posts error ${postsRes.status}: ${text}`);
    }
    return await postsRes.json() as ApifyReel[];
  });

  // Filter to only video posts within 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentReels = posts.filter(
    (p) => p.videoUrl && p.timestamp && new Date(p.timestamp) >= cutoff
  );

  const reelsCount30d = recentReels.length;
  const avgViews30d = reelsCount30d > 0
    ? Math.round(recentReels.reduce((sum, r) => sum + (r.videoPlayCount || 0), 0) / reelsCount30d)
    : 0;

  return { profilePicUrl, followers, reelsCount30d, avgViews30d };
}
