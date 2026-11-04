import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { SCRIPT_COLLECTION, normalizeDraft, normalizeResearch, type SavedScript } from "@/lib/script-flow";
import { readBody, readSource } from "@/lib/script-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const personaId = new URL(req.url).searchParams.get("personaId");
  try {
    let scripts = await getStore().list<SavedScript>(SCRIPT_COLLECTION);
    if (personaId) scripts = scripts.filter((s) => s.personaId === personaId);
    scripts.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
    return NextResponse.json({ scripts });
  } catch (err) {
    console.error("[scripts] list failed", err);
    return NextResponse.json({ error: "Couldn't load your scripts. Please try again." }, { status: 500 });
  }
}

/** Create, or update when `id` matches an existing script. */
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  const personaId = typeof body.personaId === "string" ? body.personaId.trim() : "";
  const script = normalizeDraft(body.script);
  if (!personaId || !script.fullScript) {
    return NextResponse.json({ error: "Nothing to save yet." }, { status: 400 });
  }
  try {
    const store = getStore();
    const id = typeof body.id === "string" && body.id ? body.id : "";
    const existing = id ? await store.get<SavedScript>(SCRIPT_COLLECTION, id) : null;
    const now = new Date().toISOString();
    const source = readSource(body.source) ?? undefined;
    const saved: SavedScript = {
      id: existing?.id ?? randomUUID(),
      personaId,
      title: script.title,
      sourceVideoUrl: source?.video?.url,
      source,
      hook: typeof body.hook === "string" ? body.hook.slice(0, 300) : "",
      research: body.research ? normalizeResearch(body.research) : undefined,
      script,
      lengthSec: Number(body.lengthSec) || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await store.upsert(SCRIPT_COLLECTION, saved);
    return NextResponse.json({ script: saved }, { status: existing ? 200 : 201 });
  } catch (err) {
    console.error("[scripts] save failed", err);
    return NextResponse.json({ error: "Couldn't save this script. Please try again." }, { status: 500 });
  }
}
