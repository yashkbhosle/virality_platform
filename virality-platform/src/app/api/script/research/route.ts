import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { personaToPromptBlock } from "@/lib/persona";
import { normalizeResearch, sourceToPromptBlock } from "@/lib/script-flow";
import { aiError, readBody, readSource, requirePersona } from "@/lib/script-api";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const p = await requirePersona(body.personaId);
  if ("error" in p) return p.error;
  const source = readSource(body.source);
  if (!source) return NextResponse.json({ error: "Add a topic first." }, { status: 400 });

  const prompt = `You are a research assistant for a short-form video creator.

${personaToPromptBlock(p.persona)}

${sourceToPromptBlock(source)}

Research this topic for ONE short video for this creator's audience.

Return JSON only:
{
  "executiveSummary": "3-4 plain sentences: what the viewer needs to know",
  "surprisingFacts": [{"fact": "...", "sourceHint": "where this could be verified, e.g. 'CMHC website', 'Statistics Canada 2024'"}],
  "contrastMoments": [{"before": "old way / myth", "after": "new way / truth"}],
  "stepByStep": ["only if the topic is a how-to, else []"],
  "angle": "the ONE non-obvious angle this creator should take",
  "topicFit": {"fits": true, "reason": "does this topic fit the creator's topics and audience? one sentence"}
}

RULES:
- 3-5 surprisingFacts, 2-4 contrastMoments.
- Facts must be things you are confident are true. If unsure of an exact number, describe it without a number. Never invent studies or statistics.
- Keep everything relevant to the creator's location and audience when they have one.
- topicFit.fits = false if the topic is outside the creator's topics or would confuse their audience.`;

  try {
    const raw = await geminiJSON<unknown>({ prompt, temperature: 0.5, thinking: "low" });
    const research = normalizeResearch(raw);
    if (!research.executiveSummary && !research.surprisingFacts.length) throw new Error("empty research");
    return NextResponse.json({ research });
  } catch (err) {
    return aiError("script/research", err, "Couldn't research this topic right now. Please try again.");
  }
}
