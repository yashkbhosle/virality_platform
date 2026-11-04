// Server-only helpers shared by the /api/script/* routes.
import { NextResponse } from "next/server";
import { getStore } from "./store";
import { PERSONA_COLLECTION } from "./persona";
import type { Persona } from "./types";
import type { ScriptSource } from "./script-flow";

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}

/** Loads the persona or returns a friendly 400/404 response. */
export async function requirePersona(personaId: unknown): Promise<{ persona: Persona } | { error: NextResponse }> {
  const id = typeof personaId === "string" ? personaId.trim() : "";
  if (!id) {
    return { error: NextResponse.json({ error: "Create or pick a persona first so the script sounds like you.", needsPersona: true }, { status: 400 }) };
  }
  const persona = await getStore().get<Persona>(PERSONA_COLLECTION, id).catch(() => null);
  if (!persona) {
    return { error: NextResponse.json({ error: "That persona no longer exists. Pick another one.", needsPersona: true }, { status: 404 }) };
  }
  return { persona };
}

export function readSource(v: unknown): ScriptSource | null {
  if (!v || typeof v !== "object") return null;
  const s = v as ScriptSource;
  if (typeof s.topic !== "string" || !s.topic.trim()) return null;
  return { ...s, topic: s.topic.trim().slice(0, 500), direction: typeof s.direction === "string" ? s.direction.slice(0, 1000) : undefined };
}

export function aiError(tag: string, err: unknown, message = "The AI couldn't finish this step. Please try again.") {
  console.error(`[${tag}] failed`, err);
  return NextResponse.json({ error: message }, { status: 502 });
}
