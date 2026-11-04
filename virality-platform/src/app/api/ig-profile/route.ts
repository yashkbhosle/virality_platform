import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_API_TOKEN not set" }, { status: 500 });

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}&timeout=200`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${username}/reels/`],
          resultsType: "posts",
          // The newest 60 reels are plenty to rank, and far faster/cheaper than 500.
          resultsLimit: 60,
          isUserReelFeedURL: true,
          addParentData: false,
          timeoutSecs: 180,
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 402 || /usage hard limit|not enough usage|exceeded/i.test(detail)) {
        return NextResponse.json(
          { error: "Your Apify account has used up its monthly limit, so Instagram reels can't load. Raise the limit or add credit at console.apify.com (Billing), or wait for next month's reset." },
          { status: 402 }
        );
      }
      throw new Error(`Apify error ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = await res.json() as any[];

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
    console.error("[ig-profile] error:", err.message);
    return NextResponse.json({ error: "Couldn't load reels from Instagram right now. Please try again in a minute." }, { status: 502 });
  }
}
