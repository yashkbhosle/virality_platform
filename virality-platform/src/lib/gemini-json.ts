// Shared Gemini helper that returns parsed JSON.
// Uses responseMimeType=application/json, retries once on 5xx/429,
// and salvages the first {...} block if strict parsing fails.

import { GEMINI_GENERATE_URL } from "@/lib/gemini-model";

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

export async function geminiJSON<T>(opts: {
  prompt: string;
  fileUri?: string; // e.g. a YouTube URL for video understanding
  mimeType?: string; // defaults to video/* when fileUri is set
  temperature?: number; // default 0.7
}): Promise<T> {
  const key = getApiKey();
  const parts: Record<string, unknown>[] = [];
  if (opts.fileUri) {
    parts.push({ fileData: { fileUri: opts.fileUri, mimeType: opts.mimeType ?? "video/*" } });
  }
  parts.push({ text: opts.prompt });

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      responseMimeType: "application/json",
    },
  });

  let lastError: GeminiJSONError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${GEMINI_GENERATE_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new GeminiJSONError(`Gemini error ${res.status}`, res.status);
      if (retryable && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
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
