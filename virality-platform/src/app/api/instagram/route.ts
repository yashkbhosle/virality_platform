import { NextRequest, NextResponse } from "next/server";
import { computeViralityMetrics } from "@/lib/virality";

const PERIOD_DAYS: Record<string, number> = { "14d": 14, "30d": 30, "6mo": 180, "1y": 365, "2y": 730 };

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const period = searchParams.get("period") || "all";

  if (!q.trim()) return NextResponse.json({ error: "Query required" }, { status: 400 });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 500 });

  const tag = q.trim().split(/\s+/)[0].toLowerCase();

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/clockworks~instagram-hashtag-posts-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hashtag: tag,
          resultsLimit: 200,
          timeoutSecs: 120,
        }),
      }
    );
    if (!res.ok) throw new Error(`Apify error ${res.status}: ${await res.text()}`);

    const data = await res.json() as any[];

    // Period filter — previously the selected period was ignored for Instagram
    const days = PERIOD_DAYS[period];
    const cutoff = days ? Date.now() - days * 86400000 : 0;

    const videos = data
      .filter((item) => item.videoUrl)
      .filter((item) => !cutoff || (item.timestamp && new Date(item.timestamp).getTime() >= cutoff))
      .map((item) => {
        const views = item.videoPlayCount || 0;
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
      return NextResponse.json({ videos: [], message: "No Reels found for this hashtag in the selected period. Try a longer period or a broader keyword." });
    }

    console.log(`[instagram] q=${q} period=${period} → ${videos.length} results`);
    return NextResponse.json({ videos });
  } catch (err: any) {
    console.error("[instagram] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
