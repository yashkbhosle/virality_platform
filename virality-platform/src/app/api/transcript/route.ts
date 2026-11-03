import { NextRequest, NextResponse } from "next/server";
import { buildViralAnalysisPrompt, parseViralAnalysis } from "@/lib/analysis-prompt";
import type { ViralityMetrics } from "@/lib/virality";

export const maxDuration = 120;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function getKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  return key;
}

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
  const key = getKey();

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

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { fileUri: youtubeUrl } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return parseViralAnalysis(raw);
}

export async function POST(req: NextRequest) {
  const { url, title, channelTitle, views = 0, likes = 0, comments = 0, metrics = null } = await req.json();

  try {
    const videoId = extractYouTubeId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    // Gemini accepts both watch and shorts URLs directly
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const result = await analyzeVideoWithGemini(watchUrl, {
      title: title || "",
      creator: channelTitle || "",
      views: Number(views) || 0,
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      metrics,
    });

    const { transcript = "", ...analysis } = result;
    return NextResponse.json({ transcript, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
