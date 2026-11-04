import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { personaToPromptBlock } from "@/lib/persona";
import { ENGAGEMENT_RULES, SCRIPT_JSON_SHAPE, normalizeDraft, normalizeResearch, researchToPromptBlock } from "@/lib/script-flow";
import { aiError, readBody, requirePersona } from "@/lib/script-api";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const p = await requirePersona(body.personaId);
  if ("error" in p) return p.error;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 500) : "";
  const current = normalizeDraft(body.script);
  if (!instruction) return NextResponse.json({ error: "Tell the AI what to change." }, { status: 400 });
  if (!current.fullScript) return NextResponse.json({ error: "There's no script to improve yet." }, { status: 400 });
  const research = body.research ? normalizeResearch(body.research) : null;

  const prompt = `You are editing a short-form video script for one specific creator.

${personaToPromptBlock(p.persona)}
${researchToPromptBlock(research)}

CURRENT SCRIPT (JSON):
${JSON.stringify({ title: current.title, fullScript: current.fullScript, beats: current.beats, cta: current.cta, shotList: current.shotList, caption: current.caption })}

EDIT REQUEST: "${instruction}"

Apply the edit request and return the whole updated script.
- Keep the opening hook line unless the request is about the hook.
- Keep roughly the same length (${current.wordCount} words) unless asked to change it.
- Keep beats, shotList and caption consistent with the new words.
- If asked to "add a stat", only use a fact from the research above, or write a placeholder like [X%] — never invent a number.

${ENGAGEMENT_RULES}

Return JSON only:
${SCRIPT_JSON_SHAPE}`;

  try {
    const raw = await geminiJSON<unknown>({ prompt, temperature: 0.7, thinking: "low" });
    const script = normalizeDraft(raw);
    if (!script.fullScript) throw new Error("empty script");
    return NextResponse.json({ script });
  } catch (err) {
    return aiError("script/revise", err, "Couldn't apply that change right now. Please try again.");
  }
}
