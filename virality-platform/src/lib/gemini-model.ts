// Single place that decides which Gemini model the app calls.
// Override with GEMINI_MODEL (e.g. "gemini-3.5-flash"). Google retires older models for
// new API keys, so a new key may need a newer model than the default.
// GEMINI_FALLBACK_MODEL (optional) is tried by geminiJSON when the main model is overloaded.

export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL?.trim() || "";

export function geminiGenerateUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const GEMINI_GENERATE_URL = geminiGenerateUrl(GEMINI_MODEL);
