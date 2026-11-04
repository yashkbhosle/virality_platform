import { NextRequest, NextResponse } from "next/server";
import { buildViralAnalysisPrompt, normalizeExtras, type ViralAnalysis } from "@/lib/analysis-prompt";
import { geminiJSON } from "@/lib/gemini-json";
import { withAnalysisCache, youtubeAnalysisKey } from "@/lib/analysis-cache";
import { wantsFresh } from "@/lib/apify-cache";
import type { ViralityMetrics } from "@/lib/virality";

export const maxDuration = 120;

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function analyzeVideoWithGemini(
  youtubeUrl: string,
  ctx: { title: string; creator: string; views: number; likes: number; comments: number; metrics: ViralityMetrics | null }
) {
  const prompt = buildViralAnalysisPrompt({
    platform: "YouTube Short",
    title: ctx.title,
    creator: ctx.creator,
    views: ctx.views,
    likes: ctx.likes,
    comments: ctx.comments,
    metrics: ctx.metrics,
    hasVideo: true,
    includeTranscript: true,
  });

  // geminiJSON retries overloads and falls back to GEMINI_FALLBACK_MODEL.
  const raw = await geminiJSON<ViralAnalysis & { transcript?: string }>({ prompt, fileUri: youtubeUrl, temperature: 0.7 });
  return normalizeExtras(raw);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, title, channelTitle, views = 0, likes = 0, comments = 0, metrics = null } = body;

  try {
    const videoId = extractYouTubeId(url);
    if (!videoId) return NextResponse.json({ error: "That doesn't look like a YouTube link." }, { status: 400 });

    // Gemini accepts both watch and shorts URLs directly
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    // A video's content never changes, so a saved analysis is reused (free). Re-analyze sends fresh: true.
    const { result, savedAt, fromCache } = await withAnalysisCache(youtubeAnalysisKey(videoId), { fresh: wantsFresh(body) }, async () => {
      const raw = await analyzeVideoWithGemini(watchUrl, {
        title: title || "",
        creator: channelTitle || "",
        views: Number(views) || 0,
        likes: Number(likes) || 0,
        comments: Number(comments) || 0,
        metrics,
      });
      const { transcript = "", ...analysis } = raw;
      return { transcript, analysis };
    });

    return NextResponse.json({ ...result, savedAt, fromCache });
  } catch (err) {
    console.error("[transcript] analysis failed", err);
    return NextResponse.json({ error: "Couldn't analyze this video right now. Please try again in a minute." }, { status: 502 });
  }
}
