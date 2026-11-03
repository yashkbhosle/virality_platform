import { NextRequest, NextResponse } from "next/server";
import { buildViralAnalysisPrompt, parseViralAnalysis } from "@/lib/analysis-prompt";
import type { ViralityMetrics } from "@/lib/virality";

export const maxDuration = 120;

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Try to get real audio transcript via Apify's reel scraper (includeTranscript feature)
async function fetchReelTranscript(reelUrl: string): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return "";
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items?token=${token}&timeout=60`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: [reelUrl],
          resultsLimit: 1,
          includeTranscript: true,
        }),
      }
    );
    if (!res.ok) return "";
    const data = await res.json();
    return data[0]?.transcript || "";
  } catch {
    return "";
  }
}

async function analyzeWithGemini(params: {
  caption: string; plays: number; likes: number;
  comments: number; username: string; transcript: string;
  metrics: ViralityMetrics | null;
}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

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

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return parseViralAnalysis(text);
}

export async function POST(req: NextRequest) {
  const { url, caption, plays = 0, likes = 0, comments = 0, username, metrics = null } = await req.json();

  try {
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
    return NextResponse.json({ transcript, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
