import { NextRequest, NextResponse } from "next/server";
import { APIFY_CACHE_TTL, wantsFresh, withApifyCache } from "@/lib/apify-cache";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LIMIT_MESSAGE =
  "Your Apify account has used up its monthly limit, so Instagram reels can't load. Raise the limit or add credit at console.apify.com (Billing), or wait for next month's reset.";
class ApifyLimitError extends Error {}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 500 });

  try {
    const input = {
      directUrls: [`https://www.instagram.com/${username}/reels/`],
      resultsType: "posts",
      resultsLimit: 200,
      isUserReelFeedURL: true,
      addParentData: false,
      timeoutSecs: 180,
    };
    const data = await withApifyCache("apify~instagram-scraper", input, { maxAgeMs: APIFY_CACHE_TTL.creator, fresh: wantsFresh(searchParams) }, async () => {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
    );

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 402 || /usage hard limit|not enough usage|exceeded/i.test(detail)) {
        throw new ApifyLimitError(LIMIT_MESSAGE);
      }
      throw new Error(`Apify error ${res.status}: ${detail.slice(0, 300)}`);
    }

    return await res.json() as any[];
    });

    const reels = data
      .filter((item: any) => !item.error && !!item.videoUrl)
      .sort((a: any, b: any) => (b.videoPlayCount || 0) - (a.videoPlayCount || 0))
      .slice(0, limit)
      .map((item: any, i: number) => ({
        rank: i + 1,
        url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
        videoUrl: item.videoUrl,
        thumbnail: item.displayUrl || item.thumbnailUrl,
        caption: item.caption || "",
        views: item.videoPlayCount || 0,
        likes: item.likesCount || 0,
        comments: item.commentsCount || 0,
        timestamp: item.timestamp,
        shortCode: item.shortCode,
      }));

    console.log(`[ig-profile] @${username} → ${data.length} total, ${reels.length} reels`);
    if (reels.length === 0) {
      return NextResponse.json(
        { error: `No reels found for @${username}. Check that the account is public and has reels, or try again later.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ reels, total: data.length });
  } catch (err: any) {
    if (err instanceof ApifyLimitError) return NextResponse.json({ error: LIMIT_MESSAGE }, { status: 402 });
    console.error("[ig-profile] error:", err.message);
    return NextResponse.json({ error: "Couldn't load reels from Instagram right now. Please try again in a minute." }, { status: 502 });
  }
}
