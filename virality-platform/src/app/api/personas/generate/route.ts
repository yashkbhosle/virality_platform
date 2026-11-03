import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { normalizePersonaDraft } from "@/lib/persona";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
  if (description.length < 10) {
    return NextResponse.json(
      { error: "Tell us a bit more: who you are and who you help, in 1–2 sentences." },
      { status: 400 }
    );
  }

  const prompt = `You are a short-form content strategist helping a complete beginner set up their creator persona.

The creator describes themselves as:
"""${description}"""

Build a draft persona. Rules:
- Pick ONE specific target viewer (the "avatar"). Be concrete: life stage, age range, location if implied, situation. Not "everyone who...".
- Pain points and desires must be things that viewer would actually say out loud (3–5 each, short).
- Objections: 2–4 reasons this viewer might not trust or act on the creator's advice.
- Topics: 4–6 NARROW content pillars that all serve that same viewer. Narrow beats broad: "first-home down payment tricks" not "real estate".
- Tone: 3–5 adjectives that fit the creator and the viewer.
- Language: the language they would most likely post in (default "English"; use e.g. "Hinglish" if the description suggests it).
- phrasesToUse: 3–5 short phrases that would sound natural from this creator. phrasesToAvoid: 3–5 jargon or cliché phrases that would put this viewer off.
- name: a short label like "<First name or role> – <niche in 2–4 words>". Do not invent a personal name if none is given; use the role instead.
- offer: what the creator most likely sells or wants viewers to do next (book a call, DM, download...). Leave "" if unclear.
- platforms: pick from "instagram", "youtube", "tiktok". Default ["instagram"].
- Do not invent statistics or credentials.

Return ONLY this JSON:
{
  "name": string,
  "niche": string,
  "avatar": { "who": string, "painPoints": string[], "desires": string[], "objections": string[] },
  "topics": string[],
  "voice": { "tone": string, "language": string, "phrasesToUse": string[], "phrasesToAvoid": string[] },
  "offer": string,
  "platforms": string[]
}`;

  try {
    const raw = await geminiJSON<unknown>({ prompt, temperature: 0.6 });
    const draft = normalizePersonaDraft(raw);
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[personas/generate] failed", err);
    return NextResponse.json(
      { error: "We couldn't generate a persona right now. Please try again, or fill it in manually." },
      { status: 502 }
    );
  }
}
