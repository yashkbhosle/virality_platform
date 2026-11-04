// Persona helpers shared by API routes and pages (no server-only imports here).

import type { Persona, PersonaPlatform } from "./types";

export const PERSONA_COLLECTION = "personas";
export const MAX_FOCUSED_TOPICS = 6;
export const PLATFORMS: PersonaPlatform[] = ["instagram", "youtube", "tiktok"];

/** Editable fields of a persona (everything except id and timestamps). */
export type PersonaDraft = Omit<Persona, "id" | "createdAt" | "updatedAt">;

export function emptyPersonaDraft(): PersonaDraft {
  return {
    name: "",
    niche: "",
    avatar: { who: "", painPoints: [], desires: [], objections: [] },
    topics: [],
    voice: { tone: "", language: "English", phrasesToUse: [], phrasesToAvoid: [], sampleScript: "" },
    offer: "",
    platforms: ["instagram"],
    handles: {},
  };
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, maxItems = 12, maxLen = 200): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, maxLen);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

function handle(v: unknown): string | undefined {
  const s = str(v, 100).replace(/^@/, "");
  return s || undefined;
}

/** Coerce untrusted input (request body or model output) into a clean PersonaDraft. */
export function normalizePersonaDraft(raw: unknown): PersonaDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const avatar = (r.avatar && typeof r.avatar === "object" ? r.avatar : {}) as Record<string, unknown>;
  const voice = (r.voice && typeof r.voice === "object" ? r.voice : {}) as Record<string, unknown>;
  const handles = (r.handles && typeof r.handles === "object" ? r.handles : {}) as Record<string, unknown>;
  const platforms = Array.isArray(r.platforms)
    ? PLATFORMS.filter((p) => (r.platforms as unknown[]).includes(p))
    : [];

  return {
    name: str(r.name, 120),
    niche: str(r.niche, 300),
    avatar: {
      who: str(avatar.who, 400),
      painPoints: strList(avatar.painPoints),
      desires: strList(avatar.desires),
      objections: strList(avatar.objections),
    },
    topics: strList(r.topics, 20),
    voice: {
      tone: str(voice.tone, 200),
      language: str(voice.language, 60) || "English",
      phrasesToUse: strList(voice.phrasesToUse, 20),
      phrasesToAvoid: strList(voice.phrasesToAvoid, 20),
      sampleScript: str(voice.sampleScript, 8000),
    },
    offer: str(r.offer, 300),
    platforms: platforms.length ? platforms : ["instagram"],
    handles: {
      instagram: handle(handles.instagram),
      youtube: handle(handles.youtube),
      tiktok: handle(handles.tiktok),
    },
  };
}

/** Returns a list of human-readable problems that block saving. Empty = valid. */
export function validatePersonaDraft(d: PersonaDraft): string[] {
  const errors: string[] = [];
  if (!d.name) errors.push("Give this persona a name.");
  if (!d.niche) errors.push("Describe your niche.");
  if (!d.avatar.who) errors.push("Describe the one viewer you're talking to.");
  if (d.topics.length === 0) errors.push("Add at least one topic.");
  return errors;
}

/** Client-side "too broad" check. The AI focus check in /api/personas/check-focus covers the avatar fit. */
export function topicsTooBroad(topics: string[]): boolean {
  return topics.filter(Boolean).length > MAX_FOCUSED_TOPICS;
}

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `  - ${i}`).join("\n") : "  - (none given)";
}

/** Compact text block that every Create prompt includes. */
export function personaToPromptBlock(p: Pick<Persona, "name" | "niche" | "avatar" | "topics" | "voice" | "offer" | "platforms">): string {
  const lines = [
    "=== CREATOR PERSONA (write everything for this creator and this ONE viewer) ===",
    `Creator: ${p.name}`,
    `Niche: ${p.niche}`,
    `Target viewer (one avatar): ${p.avatar.who}`,
    `Viewer pain points:\n${bullets(p.avatar.painPoints)}`,
    `Viewer desires:\n${bullets(p.avatar.desires)}`,
  ];
  if (p.avatar.objections.length) lines.push(`Viewer objections:\n${bullets(p.avatar.objections)}`);
  lines.push(`Content pillars (stay inside these):\n${bullets(p.topics)}`);
  lines.push(`Voice: ${p.voice.tone || "natural, conversational"}. Language: ${p.voice.language || "English"}.`);
  if (p.voice.phrasesToUse.length) lines.push(`Phrases to use: ${p.voice.phrasesToUse.join("; ")}`);
  if (p.voice.phrasesToAvoid.length) lines.push(`Never say: ${p.voice.phrasesToAvoid.join("; ")}`);
  if (p.voice.sampleScript) {
    lines.push(`Sample of how they actually talk (match this rhythm, don't copy it):\n"""${p.voice.sampleScript.slice(0, 1200)}"""`);
  }
  if (p.offer) lines.push(`Offer / CTA destination: ${p.offer}`);
  if (p.platforms.length) lines.push(`Platforms: ${p.platforms.join(", ")}`);
  lines.push("=== END PERSONA ===");
  return lines.join("\n");
}
