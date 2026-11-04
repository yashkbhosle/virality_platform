import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { PERSONA_COLLECTION, normalizePersonaDraft, validatePersonaDraft } from "@/lib/persona";
import type { Persona } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "That persona no longer exists." };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const persona = await getStore().get<Persona>(PERSONA_COLLECTION, id);
    if (!persona) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ persona });
  } catch (err) {
    console.error("[personas] get failed", err);
    return NextResponse.json({ error: "Couldn't load this persona. Please try again." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const draft = normalizePersonaDraft(body);
  const errors = validatePersonaDraft(draft);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  try {
    const store = getStore();
    const existing = await store.get<Persona>(PERSONA_COLLECTION, id);
    if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 });
    const persona: Persona = { ...draft, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await store.upsert(PERSONA_COLLECTION, persona);
    return NextResponse.json({ persona });
  } catch (err) {
    console.error("[personas] update failed", err);
    return NextResponse.json({ error: "Couldn't save your changes. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    await getStore().remove(PERSONA_COLLECTION, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[personas] delete failed", err);
    return NextResponse.json({ error: "Couldn't delete this persona. Please try again." }, { status: 500 });
  }
}
