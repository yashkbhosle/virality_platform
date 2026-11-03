import { NextRequest, NextResponse } from "next/server";
import { GEMINI_GENERATE_URL } from "@/lib/gemini-model";
import { getChannelTopVideos } from "@/lib/youtube";



function getKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY not set");
  return k;
}

export async function POST(req: NextRequest) {
  const { channels } = await req.json(); // array of channel handles

  try {
    // Fetch top videos for each channel in parallel
    const results = await Promise.allSettled(
      channels.map(async (ch: string) => {
        const videos = await getChannelTopVideos(ch, 15);
        return { channel: ch, videos };
      })
    );

    const channelData = results
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value);

    // Generate AI analysis of patterns
    const videoSummary = channelData.map(({ channel, videos }: any) => {
      const topVideos = videos.slice(0, 10).map((v: any) => `- "${v.title}" (${(v.views / 1000).toFixed(0)}K views)`).join("\n");
      return `Channel: ${channel}\nTop videos:\n${topVideos}`;
    }).join("\n\n---\n\n");

    const prompt = `Analyze these competitor YouTube channels and their top videos to identify content patterns.

${videoSummary}

Return ONLY this JSON (no markdown):
{
  "topFormats": [
    {"format": "Format name", "frequency": "How often used", "avgViews": "Estimated avg views", "example": "Example title pattern"}
  ],
  "contentPatterns": ["Pattern 1", "Pattern 2", "Pattern 3", "Pattern 4", "Pattern 5"],
  "topicClusters": ["Topic cluster 1", "Topic cluster 2", "Topic cluster 3"],
  "hookPatterns": ["Common hook pattern 1", "Common hook pattern 2", "Common hook pattern 3"],
  "bestPostingStrategy": "Recommendation for posting strategy based on analysis",
  "contentGaps": ["Opportunity 1", "Opportunity 2", "Opportunity 3"],
  "recommendation": "Top 3 actionable recommendations to beat these competitors"
}`;

    const res = await fetch(`${GEMINI_GENERATE_URL}?key=${getKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const analysis = JSON.parse(clean);

    return NextResponse.json({ channelData, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
