import { NextRequest, NextResponse } from "next/server";
import { computeViralityMetrics } from "@/lib/virality";

const PERIOD_DAYS: Record<string, number> = { "14d": 14, "30d": 30, "6mo": 180, "1y": 365, "2y": 730 };

export const maxDuration = 300;

interface IGItem {
  url?: string; videoUrl?: string; displayUrl?: string; ownerUsername?: string;
  videoPlayCount?: number; videoViewCount?: number; likesCount?: number; commentsCount?: number;
  caption?: string; timestamp?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const period = searchParams.get("period") || "all";

  if (!q.trim()) return NextResponse.json({ error: "Query required" }, { status: 400 });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return NextResponse.json({ error: "Instagram search isn't set up yet (missing Apify token)." }, { status: 500 });

  // Hashtags have no spaces: "first time home buyer" -> #firsttimehomebuyer (not #first).
  const tag = q.trim().toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}_]+/gu, "");
  if (!tag) return NextResponse.json({ error: "Use letters or numbers for an Instagram hashtag search." }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hashtags: [tag],
          resultsLimit: 100,
          // "reels" returns video posts with play counts; "posts" is mostly images.
          resultsType: "reels",
        }),
      }
    );
    if (!res.ok) throw new Error(`Apify error ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const raw: unknown = await res.json();
    const data = (Array.isArray(raw) ? raw : []) as IGItem[];

    // Period filter — previously the selected period was ignored for Instagram
    const days = PERIOD_DAYS[period];
    const cutoff = days ? Date.now() - days * 86400000 : 0;

    const videos = data
      .filter((item) => item.videoUrl)
      .filter((item) => !cutoff || (item.timestamp && new Date(item.timestamp).getTime() >= cutoff))
      .map((item) => {
        const views = item.videoPlayCount || item.videoViewCount || 0;
        const likes = item.likesCount || 0;
        const comments = item.commentsCount || 0;
        return {
          url: item.url,
          videoUrl: item.videoUrl,
          thumbnail: item.displayUrl,
          creator: item.ownerUsername,
          views,
          likes,
          comments,
          caption: item.caption || "",
          timestamp: item.timestamp,
          // Engagement metrics only make sense when the real play count is known
          metrics: views > 0 ? computeViralityMetrics({ views, likes, comments }) : null,
        };
      })
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 40);

    if (videos.length === 0) {
      return NextResponse.json({ videos: [], message: `No Reels found for #${tag} in the selected period. Try a longer period or a shorter keyword.` });
    }

    console.log(`[instagram] q=${q} tag=${tag} period=${period} → ${videos.length} results`);
    return NextResponse.json({ videos });
  } catch (err) {
    console.error("[instagram] error:", err);
    return NextResponse.json({ error: "Couldn't load Instagram reels right now. Please try again in a minute." }, { status: 502 });
  }
}
