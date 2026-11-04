import { NextRequest, NextResponse } from "next/server";
import { parseProfileUrls, tierFor, creatorKey, type DiscoveredCreator } from "@/lib/creators-shared";
import {
  fetchInstagramProfiles, fetchYouTubeChannels, youtubeChannelToCandidate, toDiscovered, buildWhy, profileAvgPlays,
} from "@/lib/discover";

export const maxDuration = 120;

const MAX_URLS = 25;

// Resolve pasted profile URLs into creator cards (stats only, no relevance scoring).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = parseProfileUrls(typeof body?.text === "string" ? body.text : "").slice(0, MAX_URLS);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "Paste YouTube (youtube.com/@handle) or Instagram (instagram.com/username) profile links, one per line." },
      { status: 400 }
    );
  }

  const creators: DiscoveredCreator[] = [];
  const notFound: string[] = [];
  const notes: string[] = [];

  // YouTube: channel ids in one batch; @handles via forHandle (1 unit each)
  const yt = parsed.filter((p) => p.platform === "youtube");
  if (yt.length) {
    try {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) throw new Error("YOUTUBE_API_KEY not set");
      const ids = yt.filter((p) => p.channelId).map((p) => p.channelId!);
      for (const p of yt.filter((x) => x.handle)) {
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent("@" + p.handle)}&key=${key}`
        );
        const d = r.ok ? await r.json() : null;
        const id = d?.items?.[0]?.id;
        if (id) ids.push(id);
        else notFound.push(p.raw);
      }
      const channels = await fetchYouTubeChannels(Array.from(new Set(ids)));
      for (const ch of channels) {
        const c = youtubeChannelToCandidate(ch);
        creators.push(toDiscovered(c, null, 0));
      }
    } catch (err) {
      console.error("[discover/resolve] youtube failed", err);
      notes.push("Couldn't look up YouTube channels right now.");
    }
  }

  // Instagram: one Apify profile run for all usernames
  const ig = parsed.filter((p) => p.platform === "instagram");
  if (ig.length) {
    try {
      const profiles = await fetchInstagramProfiles(ig.map((p) => p.handle!));
      const found = new Set<string>();
      for (const prof of profiles) {
        if (!prof.username) continue;
        found.add(prof.username.toLowerCase());
        const followers = prof.followersCount ?? 0;
        const avg = profileAvgPlays(prof);
        creators.push({
          key: creatorKey("instagram", prof.username),
          platform: "instagram",
          handle: prof.username,
          name: prof.fullName || prof.username,
          thumbnail: prof.profilePicUrlHD || prof.profilePicUrl || "",
          url: `https://www.instagram.com/${prof.username}/`,
          followers,
          tier: tierFor(followers),
          avgViewsPerVideo: avg,
          viewsPerFollower: followers > 0 ? Math.round((avg / followers) * 100) / 100 : 0,
          relevance: null,
          discoveryScore: 0,
          why: buildWhy({ platform: "instagram", followers, avgViewsPerVideo: avg }),
        });
      }
      for (const p of ig) if (!found.has(p.handle!.toLowerCase())) notFound.push(p.raw);
    } catch (err) {
      console.error("[discover/resolve] instagram failed", err);
      notes.push("Couldn't look up Instagram profiles right now.");
    }
  }

  return NextResponse.json({ creators, notFound, notes });
}
