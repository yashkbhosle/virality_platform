import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { personaToPromptBlock } from "@/lib/persona";
import {
  ENGAGEMENT_RULES, SCRIPT_JSON_SHAPE, SCRIPT_LENGTHS, WORDS_PER_SECOND, normalizeDraft, normalizeResearch,
  researchToPromptBlock, sourceToPromptBlock,
} from "@/lib/script-flow";
import { aiError, readBody, readSource, requirePersona } from "@/lib/script-api";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const p = await requirePersona(body.personaId);
  if ("error" in p) return p.error;
  const source = readSource(body.source);
  const hook = typeof body.hook === "string" ? body.hook.trim().slice(0, 300) : "";
  if (!source || !hook) return NextResponse.json({ error: "Pick a topic and a hook first." }, { status: 400 });
  const lengthSec = SCRIPT_LENGTHS.includes(Number(body.lengthSec) as never) ? Number(body.lengthSec) : 30;
  const research = body.research ? normalizeResearch(body.research) : null;
  const targetWords = Math.round(lengthSec * WORDS_PER_SECOND);

  const prompt = `You are a short-form video scriptwriter writing for one specific creator.

${personaToPromptBlock(p.persona)}

${sourceToPromptBlock(source)}
${researchToPromptBlock(research)}

OPENING HOOK (use these exact words as the first line): "${hook}"
TARGET LENGTH: ${lengthSec} seconds ≈ ${targetWords} spoken words (2.5 words per second). Stay within ±15%.

${ENGAGEMENT_RULES}

WRITING RULES:
- Sound exactly like the creator: their tone, language and phrases. Never use their "avoid" phrases.
- Short spoken lines. No headings, no stage directions inside fullScript.
- Use only facts from the research above; keep them cautious. Never invent new numbers.
- If a source video is given, follow its structure and pacing, but with this creator's own content.
- The CTA must point to the creator's offer when they have one.
- beats cover the whole video with time ranges that add up to about ${lengthSec}s.
- shotList: 4-8 steps a beginner can film on a phone with natural light${source.video?.visualPlaybook ? ", adapted from how the source video was filmed" : ""}.

Return JSON only:
${SCRIPT_JSON_SHAPE}`;

  try {
    const raw = await geminiJSON<unknown>({ prompt, temperature: 0.8, thinking: "low" });
    const script = normalizeDraft(raw);
    if (!script.fullScript) throw new Error("empty script");
    return NextResponse.json({ script });
  } catch (err) {
    return aiError("script/generate", err, "Couldn't write the script right now. Please try again.");
  }
}
