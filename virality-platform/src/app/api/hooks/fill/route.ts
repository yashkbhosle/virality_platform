import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { getStore } from "@/lib/store";
import { PERSONA_COLLECTION, personaToPromptBlock } from "@/lib/persona";
import type { Persona } from "@/lib/types";

export const maxDuration = 120;

interface FillResult {
  hooks?: { text?: unknown; note?: unknown }[];
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const template = str(body?.template);
  const personaId = str(body?.personaId, 64);
  const topic = str(body?.topic, 300);
  if (!template) return NextResponse.json({ error: "Missing hook template." }, { status: 400 });
  if (!personaId) {
    return NextResponse.json({ error: "Create or pick a persona first so hooks match your voice.", needsPersona: true }, { status: 400 });
  }

  const persona = await getStore().get<Persona>(PERSONA_COLLECTION, personaId).catch(() => null);
  if (!persona) {
    return NextResponse.json({ error: "That persona no longer exists. Pick another one.", needsPersona: true }, { status: 404 });
  }

  const variables = (Array.isArray(body?.variables) ? body.variables : [])
    .map((v: unknown) => {
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return `- ${str(o.name, 80)} (original example: "${str(o.example, 200)}")`;
    })
    .filter((line: string) => !line.startsWith("-  "))
    .join("\n");

  const prompt = `You write short-form video hooks for one specific creator.

${personaToPromptBlock(persona)}

HOOK FORMULA (from a video that went viral):
"${template}"
${variables ? `\nVARIABLES TO FILL:\n${variables}\n` : ""}${topic ? `\nTHIS VIDEO'S TOPIC: ${topic}\n` : ""}
Write 5 different hooks that follow this formula's structure and rhythm, filled in for THIS creator's niche, audience and offer.

RULES:
- Each hook under 15 words. Spoken first line of a video, not a title.
- Sound like the creator: use their tone and phrases, never their "avoid" phrases.
- Speak directly to their audience's real pain or desire.
- Use only facts the creator could truthfully say. Never invent statistics, prices or results; if the formula needs a number, use a placeholder like [X%].
- Each of the 5 should take a different angle (different pain, topic or payoff).
- "note" = one short line telling the creator why this angle works for their audience.

Return JSON only:
{"hooks":[{"text":"...","note":"..."}]}`;

  try {
    const raw = await geminiJSON<FillResult>({ prompt, temperature: 0.9, thinking: "low" });
    const hooks = (Array.isArray(raw?.hooks) ? raw.hooks : [])
      .map((h) => ({ text: str(h?.text, 200), note: str(h?.note, 240) }))
      .filter((h) => h.text)
      .slice(0, 5);
    if (!hooks.length) throw new Error("empty");
    return NextResponse.json({ hooks });
  } catch (err) {
    console.error("[hooks/fill] failed", err);
    return NextResponse.json({ error: "Couldn't write hooks right now. Please try again." }, { status: 502 });
  }
}
