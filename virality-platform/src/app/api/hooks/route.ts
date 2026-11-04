import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { getStore } from "@/lib/store";
import { PERSONA_COLLECTION, personaToPromptBlock } from "@/lib/persona";
import { DEFAULT_HOOKS } from "@/lib/hook-library";
import type { Persona } from "@/lib/types";

export const maxDuration = 120;

interface RawHook {
  text?: unknown;
  type?: unknown;
  why?: unknown;
  structureId?: unknown;
}

function str(v: unknown, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Accepts {hooks:[...]}, a bare array, or hooks grouped by structure
 * ({structures:[{structureId, hooks:[...]}]} or similar), and flattens them.
 */
function collectHooks(raw: unknown, structureId?: unknown): RawHook[] {
  if (Array.isArray(raw)) return raw.flatMap((x) => collectHooks(x, structureId));
  if (!raw || typeof raw !== "object") {
    return typeof raw === "string" && raw.trim() ? [{ text: raw, structureId }] : [];
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.text === "string" || typeof o.hook === "string") {
    return [{ ...o, text: o.text ?? o.hook, structureId: o.structureId ?? o.id ?? structureId }];
  }
  const sid = o.structureId ?? o.id ?? structureId;
  return Object.values(o).filter((v) => typeof v === "object" && v !== null).flatMap((v) => collectHooks(v, sid));
}

const RULES =`Make them punchy, direct, under 15 words each. NO fluff.
Never invent statistics, prices or results; if a hook needs a number, use a placeholder like [X%].`;

function genericPrompt(topic: string, niche: string, style: string, reference: string) {
  return `You are a world-class viral content hook writer. Generate 15 powerful hooks for short-form video content.

Topic: "${topic}"
Niche: "${niche || "general"}"
Style: "${style || "engaging"}"
${reference ? `Reference video context: "${reference}"` : ""}

Generate exactly 15 hooks in different styles. Return ONLY this JSON:
{
  "hooks": [
    {
      "text": "The hook text here",
      "type": "Question|Shock|Story|Promise|Controversy|Statistics|Challenge|Curiosity|Fear|Social Proof",
      "why": "One sentence explaining why this hook works"
    }
  ]
}

Hook types to include (mix them): Question, Shock/surprising stat, Controversial statement, Story ("I once..."),
Promise ("In the next 60 seconds..."), Fear (loss aversion), Social proof, Curiosity gap, Challenge,
Direct address ("If you're a [niche]..."), plus 5 more variations.

${RULES}`;
}

function personaPrompt(persona: Persona, topic: string, style: string, reference: string) {
  const library = DEFAULT_HOOKS.map((h) => `- ${h.id}: ${h.name}: "${h.template}" (best for: ${h.bestFor})`).join("\n");
  return `You are a world-class viral content hook writer working for one specific creator.

${personaToPromptBlock(persona)}

VIDEO TOPIC: "${topic}"
STYLE: "${style || "engaging"}"
${reference ? `REFERENCE VIDEO: "${reference}"\n` : ""}
PROVEN HOOK STRUCTURES:
${library}

Pick the 5 structures that best fit this creator, their audience and this topic.
For each of the 5, write 3 hooks that follow that structure, filled in for this creator (15 hooks total).
- Speak to the audience's real pains and desires, in the creator's tone. Use their phrases; never their "avoid" phrases.
- "why" = one sentence on why it works for THIS audience.
${RULES}

Return ONLY this JSON:
{"hooks":[{"structureId":"<id from the list>","text":"...","why":"..."}]}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const topic = str(body?.topic, 300);
  const niche = str(body?.niche, 120);
  const style = str(body?.style, 60);
  const reference = str(body?.reference, 300);
  const personaId = str(body?.personaId, 64);
  if (!topic) return NextResponse.json({ error: "Add a topic first." }, { status: 400 });

  const persona = personaId ? await getStore().get<Persona>(PERSONA_COLLECTION, personaId).catch(() => null) : null;

  try {
    const prompt = persona ? personaPrompt(persona, topic, style, reference) : genericPrompt(topic, niche, style, reference);
    const raw = await geminiJSON<unknown>({ prompt, temperature: 0.9, thinking: "low" });
    const hooks = collectHooks(raw)
      .map((h) => {
        const structure = DEFAULT_HOOKS.find((d) => d.id === str(h?.structureId, 64));
        return {
          text: str(h?.text, 240),
          // With a persona, label each hook by its library structure.
          type: structure?.name ?? (str(h?.type, 60) || "Hook"),
          why: str(h?.why, 300),
          ...(structure ? { structureId: structure.id } : {}),
        };
      })
      .filter((h) => h.text)
      .slice(0, 15);
    if (!hooks.length) throw new Error(`no hooks in response: ${JSON.stringify(raw).slice(0, 300)}`);
    return NextResponse.json({ hooks, personaUsed: persona ? persona.name : null });
  } catch (err) {
    console.error("[hooks] failed", err);
    return NextResponse.json({ error: "Couldn't generate hooks right now. Please try again." }, { status: 502 });
  }
}
