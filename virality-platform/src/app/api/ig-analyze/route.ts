import { NextRequest, NextResponse } from "next/server";
import { APIFY_CACHE_TTL, wantsFresh, withApifyCache } from "@/lib/apify-cache";
import { buildViralAnalysisPrompt, normalizeExtras, type ViralAnalysis } from "@/lib/analysis-prompt";
import { geminiJSON } from "@/lib/gemini-json";
import { instagramAnalysisKey, withAnalysisCache } from "@/lib/analysis-cache";
import type { ViralityMetrics } from "@/lib/virality";

export const maxDuration = 120;

// Try to get real audio transcript via Apify's reel scraper (includeTranscript feature)
async function fetchReelTranscript(reelUrl: string): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return "";
  const input = { username: [reelUrl], resultsLimit: 1, includeTranscript: true };
  try {
    // Transcripts never change, so one lookup per reel is enough for 30 days.
    return await withApifyCache("apify~instagram-reel-scraper", input, { maxAgeMs: APIFY_CACHE_TTL.transcript }, async () => {
      const res = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items?token=${token}&timeout=60`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );
      if (!res.ok) return "";
      const data = await res.json();
      return (data[0]?.transcript as string) || "";
    });
  } catch {
    return "";
  }
}

async function analyzeWithGemini(params: {
  caption: string; plays: number; likes: number;
  comments: number; username: string; transcript: string;
  metrics: ViralityMetrics | null;
}) {
  const prompt = buildViralAnalysisPrompt({
    platform: "Instagram Reel",
    caption: params.caption,
    creator: `@${params.username}`,
    views: params.plays,
    likes: params.likes,
    comments: params.comments,
    metrics: params.metrics,
    transcript: params.transcript,
    hasVideo: false,
    includeTranscript: false,
  });

  // geminiJSON retries overloads and falls back to GEMINI_FALLBACK_MODEL.
  const raw = await geminiJSON<ViralAnalysis>({ prompt, temperature: 0.7 });
  const analysis = normalizeExtras(raw);
  // Gemini cannot watch Instagram videos, so the filming notes are a best guess.
  if (analysis.visualPlaybook) analysis.visualPlaybook.inferred = true;
  return analysis;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { url, caption, plays = 0, likes = 0, comments = 0, username, metrics = null } = body;
  if (!url) return NextResponse.json({ error: "Reel link missing." }, { status: 400 });

  try {
    // A reel's content never changes, so a saved analysis is reused (free). Re-analyze sends fresh: true.
    // The transcript keeps its own 30-day Apify cache, so a re-analyze only pays for Gemini.
    const { result, savedAt, fromCache } = await withAnalysisCache(instagramAnalysisKey(url), { fresh: wantsFresh(body) }, async () => {
      const transcript = await fetchReelTranscript(url);
      const analysis = await analyzeWithGemini({
        caption: caption || "",
        plays: Number(plays) || 0,
        likes: Number(likes) || 0,
        comments: Number(comments) || 0,
        username: username || "",
        transcript,
        metrics,
      });
      return { transcript, analysis };
    });
    return NextResponse.json({ ...result, savedAt, fromCache });
  } catch (err) {
    console.error("[ig-analyze] analysis failed", err);
    return NextResponse.json({ error: "Couldn't analyze this reel right now. Please try again in a minute." }, { status: 502 });
  }
}
