// Single place that decides which Gemini model the app calls.
// Override with GEMINI_MODEL (e.g. "gemini-3.5-flash"). Google retires older models for
// new API keys, so a new key may need a newer model than the default.

export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
