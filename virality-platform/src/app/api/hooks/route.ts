import { NextRequest, NextResponse } from "next/server";
import { GEMINI_GENERATE_URL } from "@/lib/gemini-model";



function getKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY not set");
  return k;
}

export async function POST(req: NextRequest) {
  const { topic, niche, style, reference } = await req.json();

  const prompt = `You are a world-class viral content hook writer. Generate 15 powerful hooks for short-form video content.

Topic: "${topic}"
Niche: "${niche || "general"}"
Style: "${style || "engaging"}"
${reference ? `Reference video context: "${reference}"` : ""}

Generate exactly 15 hooks in different styles. Return ONLY this JSON (no markdown):
{
  "hooks": [
    {
      "text": "The hook text here",
      "type": "Question|Shock|Story|Promise|Controversy|Statistics|Challenge|Curiosity|Fear|Social Proof",
      "why": "One sentence explaining why this hook works"
    }
  ]
}

Hook types to include (mix them):
1. Question hook (makes viewer feel they need the answer)
2. Shock/Surprising stat hook
3. Controversial statement hook
4. Story hook ("I once...")
5. Promise hook ("In the next 60 seconds...")
6. Fear hook (loss aversion)
7. Social proof hook
8. Curiosity gap hook
9. Challenge hook
10. Direct address hook ("If you're a [niche]...")
Plus 5 more variations

Make them punchy, direct, under 15 words each. NO fluff.`;

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
