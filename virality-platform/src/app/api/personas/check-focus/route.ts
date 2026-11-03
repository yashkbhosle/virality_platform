import { NextRequest, NextResponse } from "next/server";
import { geminiJSON } from "@/lib/gemini-json";

export const maxDuration = 30;

// Checks whether a persona's topics all serve the same audience avatar.
// Returns { focused, reason, offTopic } — offTopic lists topics that don't fit the avatar.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const who = typeof body?.avatarWho === "string" ? body.avatarWho.trim().slice(0, 400) : "";
  const topics: string[] = Array.isArray(body?.topics)
    ? body.topics.filter((t: unknown): t is string => typeof t === "string" && t.trim() !== "").slice(0, 20)
    : [];
  if (!who || topics.length === 0) {
    return NextResponse.json({ error: "Add your target viewer and some topics first." }, { status: 400 });
  }

  const prompt = `A short-form creator targets ONE viewer: "${who}".
Their content pillars are:
${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Would the same viewer care about every pillar? A pillar is off-topic if it would attract a clearly different audience, or is so broad that the algorithm can't tell who it's for.

Return ONLY this JSON:
{ "focused": boolean, "reason": string (one short sentence), "offTopic": string[] (exact pillar text of the ones that don't fit) }`;

  try {
    const raw = await geminiJSON<{ focused?: unknown; reason?: unknown; offTopic?: unknown }>({ prompt, temperature: 0.2 });
    const offTopic = Array.isArray(raw.offTopic)
      ? raw.offTopic.filter((t): t is string => typeof t === "string" && topics.includes(t))
      : [];
    return NextResponse.json({
      focused: raw.focused === true && offTopic.length === 0,
      reason: typeof raw.reason === "string" ? raw.reason : "",
      offTopic,
    });
  } catch (err) {
    console.error("[personas/check-focus] failed", err);
    return NextResponse.json({ error: "We couldn't check your topics right now. Please try again." }, { status: 502 });
  }
}
