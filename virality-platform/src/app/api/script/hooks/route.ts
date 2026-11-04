import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";
import { personaToPromptBlock } from "@/lib/persona";
import { DEFAULT_HOOKS } from "@/lib/hook-library";
import { normalizeHookOptions, normalizeResearch, researchToPromptBlock, sourceToPromptBlock, type Outlier } from "@/lib/script-flow";
import { aiError, readBody, readSource, requirePersona } from "@/lib/script-api";

export const maxDuration = 120;

function readOutliers(v: unknown): Outlier[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        title: typeof o.title === "string" ? o.title.slice(0, 200) : "",
        creator: typeof o.creator === "string" ? o.creator.slice(0, 80) : "",
        views: Number(o.views) || 0,
        url: typeof o.url === "string" ? o.url.slice(0, 500) : "",
        hook: typeof o.hook === "string" ? o.hook.slice(0, 300) : undefined,
      };
    })
    .filter((o) => o.title && o.url && o.views > 0)
    .slice(0, 6);
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const p = await requirePersona(body.personaId);
  if ("error" in p) return p.error;
  const source = readSource(body.source);
  if (!source) return NextResponse.json({ error: "Add a topic first." }, { status: 400 });
  const outliers = readOutliers(body.outliers);
  const research = body.research ? normalizeResearch(body.research) : null;
  const avoid = (Array.isArray(body.avoid) ? body.avoid : []).filter((x): x is string => typeof x === "string").slice(0, 18);

  const inspiration = outliers.length
    ? `REAL OUTLIER VIDEOS (high virality, not paid). Base each hook on ONE of these — borrow its structure and trigger, not its words:
${outliers.map((o, i) => `${i + 1}. "${o.title}" by ${o.creator}, ${o.views.toLocaleString("en-US")} views${o.hook ? ` — opening hook: "${o.hook}"` : ""}`).join("\n")}
Set "inspiredByIndex" to the number of the video each hook is based on.`
    : `PROVEN HOOK STRUCTURES. Base each hook on one of these and set "structure" to its name:
${DEFAULT_HOOKS.map((h) => `- ${h.name}: "${h.template}"`).join("\n")}
Set "inspiredByIndex" to null.`;

  const prompt = `You write opening hooks for short-form videos for one specific creator.

${personaToPromptBlock(p.persona)}

${sourceToPromptBlock(source)}
${researchToPromptBlock(research)}

${inspiration}

Write 6 different hook options for THIS video, in the creator's voice.
- Each under 15 words, spoken out loud in the first 2 seconds.
- Different triggers across the 6 (curiosity, stakes, contrarian, call-out, result, question).
- Never invent statistics or results; use a placeholder like [X%] if a number is needed.
${avoid.length ? `- Do NOT repeat these hooks:\n${avoid.map((a) => `  - ${a}`).join("\n")}` : ""}

Return JSON only:
{"hooks":[{"text":"...","why":"one short line on why it works for this audience","inspiredByIndex":1,"structure":"structure name or empty"}]}`;

  try {
    const raw = await geminiJSON<unknown>({ prompt, temperature: 0.9, thinking: "low" });
    const hooks = normalizeHookOptions(raw, outliers);
    if (!hooks.length) throw new Error("no hooks");
    return NextResponse.json({ hooks, usedOutliers: outliers.length > 0 });
  } catch (err) {
    return aiError("script/hooks", err, "Couldn't write hook options right now. Please try again.");
  }
}
