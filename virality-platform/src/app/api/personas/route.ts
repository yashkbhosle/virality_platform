import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { PERSONA_COLLECTION, normalizePersonaDraft, validatePersonaDraft } from "@/lib/persona";
import type { Persona } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const personas = await getStore().list<Persona>(PERSONA_COLLECTION);
    personas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return NextResponse.json({ personas });
  } catch (err) {
    console.error("[personas] list failed", err);
    return NextResponse.json({ error: "Couldn't load your personas. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const draft = normalizePersonaDraft(body);
  const errors = validatePersonaDraft(draft);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  const now = new Date().toISOString();
  const persona: Persona = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now };
  try {
    await getStore().upsert(PERSONA_COLLECTION, persona);
    return NextResponse.json({ persona }, { status: 201 });
  } catch (err) {
    console.error("[personas] create failed", err);
    return NextResponse.json({ error: "Couldn't save this persona. Please try again." }, { status: 500 });
  }
}
