import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";

export const maxDuration = 60;

interface VoiceResult {
  tone: string;
  phrasesToUse: string[];
  phrasesToAvoid: string[];
}

function cleanList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8)
    : [];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const samples: string[] = Array.isArray(body?.samples)
    ? body.samples
        .filter((s: unknown): s is string => typeof s === "string")
        .map((s: string) => s.trim().slice(0, 4000))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (samples.length === 0 || samples.join(" ").split(/\s+/).length < 20) {
    return NextResponse.json(
      { error: "Paste at least one past script or caption (a few sentences) so we can learn your voice." },
      { status: 400 }
    );
  }

  const prompt = `You are a voice coach for short-form video creators. Study how this creator writes and speaks.

${samples.map((s, i) => `SAMPLE ${i + 1}:\n"""${s}"""`).join("\n\n")}

Describe their voice so another writer could imitate it:
- tone: 3–6 adjectives plus one short note on rhythm (e.g. "short punchy lines, lots of rhetorical questions").
- phrasesToUse: 4–8 phrases, openers or verbal habits that actually appear in or clearly match the samples.
- phrasesToAvoid: 3–6 phrases or styles that would sound unlike them (too formal, too salesy, wrong slang, etc.).
Only use evidence from the samples. Do not invent facts about the creator.

Return ONLY this JSON:
{ "tone": string, "phrasesToUse": string[], "phrasesToAvoid": string[] }`;

  try {
    const raw = await geminiJSON<Partial<VoiceResult>>({ prompt, temperature: 0.4 });
    const result: VoiceResult = {
      tone: typeof raw.tone === "string" ? raw.tone.trim() : "",
      phrasesToUse: cleanList(raw.phrasesToUse),
      phrasesToAvoid: cleanList(raw.phrasesToAvoid),
    };
    if (!result.tone) throw new Error("empty tone");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[personas/voice-from-samples] failed", err);
    return NextResponse.json({ error: "We couldn't read your voice right now. Please try again." }, { status: 502 });
  }
}
