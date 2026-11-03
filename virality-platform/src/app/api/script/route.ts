import { NextRequest, NextResponse } from "next/server";
import { GEMINI_GENERATE_URL } from "@/lib/gemini-model";



function getKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY not set");
  return k;
}

export async function POST(req: NextRequest) {
  const { topic, niche, hook, duration, format, audience, cta } = await req.json();

  const prompt = `You are a world-class viral short-form video script writer. Write a complete, ready-to-record script.

Topic: "${topic}"
Niche: "${niche || "general"}"
Hook: "${hook || "AI-generated best hook"}"
Duration: "${duration || "60"} seconds"
Format: "${format || "educational/value"}"
Target Audience: "${audience || "general"}"
Call to Action: "${cta || "follow for more"}"

Write a complete script with these exact sections. Return ONLY this JSON (no markdown):
{
  "title": "Suggested video title",
  "hook": "Opening hook (0-5 sec) - exact words to say",
  "intro": "Introduction section (5-15 sec) - exact words",
  "body": "Main content (15-50 sec) - exact words with [PAUSE] markers",
  "climax": "Key insight/punchline (50-55 sec)",
  "cta": "Call to action (55-60 sec)",
  "fullScript": "Complete script as one flowing text",
  "bRollSuggestions": ["b-roll idea 1", "b-roll idea 2", "b-roll idea 3"],
  "captionSuggestions": ["caption idea 1", "caption idea 2"],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}

The script must:
- Start with a KILLER hook (pattern interrupt)
- Use short sentences (max 10 words each)
- Include natural speaking pauses
- Build curiosity throughout
- End with strong CTA
- Be conversational, not formal
- Include [VISUAL CUE] notes where helpful`;

  try {
    const res = await fetch(`${GEMINI_GENERATE_URL}?key=${getKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
