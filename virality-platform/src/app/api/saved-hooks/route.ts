import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import type { SavedHook } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLLECTION = "saved_hooks";

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET(req: NextRequest) {
  const personaId = new URL(req.url).searchParams.get("personaId");
  try {
    let hooks = await getStore().list<SavedHook>(COLLECTION);
    if (personaId) hooks = hooks.filter((h) => !h.personaId || h.personaId === personaId);
    hooks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ hooks });
  } catch (err) {
    console.error("[saved-hooks] list failed", err);
    return NextResponse.json({ error: "Couldn't load your saved hooks. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const template = str(body?.template);
  if (!template) return NextResponse.json({ error: "Missing hook template." }, { status: 400 });

  const variables = (Array.isArray(body?.variables) ? body.variables : [])
    .map((v: unknown) => {
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return { name: str(o.name, 80), example: str(o.example, 200) };
    })
    .filter((v: { name: string }) => v.name)
    .slice(0, 8);
  const views = Number(body?.sourceViews);

  try {
    const store = getStore();
    // Don't save the same template twice for the same persona.
    const existing = (await store.list<SavedHook>(COLLECTION)).find(
      (h) => h.template.toLowerCase() === template.toLowerCase() && (h.personaId ?? "") === (str(body?.personaId) || "")
    );
    if (existing) return NextResponse.json({ hook: existing, duplicate: true });

    const hook: SavedHook = {
      id: randomUUID(),
      personaId: str(body?.personaId, 64) || undefined,
      template,
      structureName: str(body?.structureName, 120) || "Saved formula",
      libraryId: str(body?.libraryId, 64) || undefined,
      variables,
      sourceVideoUrl: str(body?.sourceVideoUrl, 500) || undefined,
      sourceTitle: str(body?.sourceTitle, 300) || undefined,
      sourceViews: Number.isFinite(views) && views > 0 ? Math.round(views) : undefined,
      createdAt: new Date().toISOString(),
    };
    await store.upsert(COLLECTION, hook);
    return NextResponse.json({ hook }, { status: 201 });
  } catch (err) {
    console.error("[saved-hooks] save failed", err);
    return NextResponse.json({ error: "Couldn't save this hook. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await getStore().remove(COLLECTION, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[saved-hooks] delete failed", err);
    return NextResponse.json({ error: "Couldn't delete this hook. Please try again." }, { status: 500 });
  }
}
