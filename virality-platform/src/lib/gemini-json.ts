// Shared Gemini helper that returns parsed JSON.
// Uses responseMimeType=application/json, retries 5xx/429 (then GEMINI_FALLBACK_MODEL),
// and salvages the first {...} block if strict parsing fails.

import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, geminiGenerateUrl } from "@/lib/gemini-model";

// Video understanding can be slow; plain JSON calls usually return in seconds.
const REQUEST_TIMEOUT_MS = 100_000;

export class GeminiJSONError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GeminiJSONError";
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiJSONError("GEMINI_API_KEY not set");
  return key;
}

/** Parse JSON, falling back to the first balanced {...} (or [...]) block in the text. */
export function salvageJSON<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to salvage
  }
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new GeminiJSONError("Model did not return JSON");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          break;
        }
      }
    }
  }
  throw new GeminiJSONError("Could not parse model JSON");
}

export type GeminiThinking = "default" | "low" | "minimal";

/** Thinking config for a model, or undefined to keep the model's default. */
function thinkingConfig(model: string, thinking: GeminiThinking): Record<string, unknown> | undefined {
  if (thinking === "default") return undefined;
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: thinking === "minimal" ? 0 : 1024 };
  if (/^gemini-([3-9]|\d{2,})/.test(model)) return { thinkingLevel: thinking };
  return undefined;
}

export async function geminiJSON<T>(opts: {
  prompt: string;
  fileUri?: string; // e.g. a YouTube URL for video understanding
  mimeType?: string; // defaults to video/* when fileUri is set
  temperature?: number; // default 0.7
  /** "minimal" is much faster for scoring/classification; keep "default" for creative work. */
  thinking?: GeminiThinking;
}): Promise<T> {
  const key = getApiKey();
  const thinking = opts.thinking ?? "default";
  const parts: Record<string, unknown>[] = [];
  if (opts.fileUri) {
    parts.push({ fileData: { fileUri: opts.fileUri, mimeType: opts.mimeType ?? "video/*" } });
  }
  parts.push({ text: opts.prompt });

  const buildBody = (model: string, withThinking: boolean) => {
    const tc = withThinking ? thinkingConfig(model, thinking) : undefined;
    return JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        responseMimeType: "application/json",
        ...(tc ? { thinkingConfig: tc } : {}),
      },
    });
  };

  // Main model: retry overloads with backoff. Then the optional fallback model.
  const plan: { model: string; waitMs: number }[] = [
    { model: GEMINI_MODEL, waitMs: 0 },
    { model: GEMINI_MODEL, waitMs: 2000 },
  ];
  if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    plan.push({ model: GEMINI_FALLBACK_MODEL, waitMs: 500 });
    plan.push({ model: GEMINI_FALLBACK_MODEL, waitMs: 3000 });
  } else {
    plan.push({ model: GEMINI_MODEL, waitMs: 5000 });
  }

  let lastError: GeminiJSONError | null = null;
  let withThinking = true;
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    if (step.waitMs) await new Promise((r) => setTimeout(r, step.waitMs));
    let res: Response;
    try {
      res = await fetch(`${geminiGenerateUrl(step.model)}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildBody(step.model, withThinking),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      lastError = new GeminiJSONError("Gemini request timed out");
      continue;
    }

    if (!res.ok) {
      lastError = new GeminiJSONError(`Gemini error ${res.status}`, res.status);
      if (res.status === 429 || res.status >= 500) continue;
      // A model that rejects the thinking config: retry the same step without it.
      if (res.status === 400 && withThinking && thinkingConfig(step.model, thinking)) {
        withThinking = false;
        i--;
        continue;
      }
      throw lastError;
    }

    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";
    if (!text) throw new GeminiJSONError("Gemini returned an empty response");
    return salvageJSON<T>(text);
  }
  throw lastError ?? new GeminiJSONError("Gemini request failed");
}
