import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { creatorKey, tierFor, type CreatorPlatform, type TrackedCreator } from "@/lib/creators-shared";

export const dynamic = "force-dynamic";

const COLLECTION = "tracked_creators";

function str(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalize(raw: unknown): Omit<TrackedCreator, "addedAt"> | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const platform = r.platform === "youtube" || r.platform === "instagram" ? (r.platform as CreatorPlatform) : null;
  const handle = str(r.handle, 100).replace(/^@/, "");
  const channelId = str(r.channelId, 64) || undefined;
  if (!platform || (!handle && !channelId)) return null;
  const followers = Math.max(0, Math.round(Number(r.followers) || 0));
  return {
    id: creatorKey(platform, platform === "youtube" ? channelId ?? handle : handle),
    platform,
    handle: handle || channelId!,
    channelId,
    name: str(r.name, 200) || handle || channelId!,
    followers,
    tier: tierFor(followers),
    personaId: str(r.personaId, 64) || undefined,
    thumbnail: str(r.thumbnail, 1000) || undefined,
    url: str(r.url, 500) || undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const personaId = searchParams.get("personaId");
  try {
    let list = await getStore().list<TrackedCreator>(COLLECTION);
    if (platform) list = list.filter((c) => c.platform === platform);
    if (personaId) list = list.filter((c) => c.personaId === personaId);
    list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    return NextResponse.json({ creators: list });
  } catch (err) {
    console.error("[tracked-creators] list failed", err);
    return NextResponse.json({ error: "Couldn't load your tracked creators. Please try again." }, { status: 500 });
  }
}

// Body: a single creator, or { creators: [...] } for bulk import (e.g. the localStorage migration).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items: unknown[] = Array.isArray(body?.creators) ? body.creators.slice(0, 200) : [body];
  const docs = items.map(normalize).filter((d): d is NonNullable<typeof d> => d !== null);
  if (docs.length === 0) {
    return NextResponse.json({ error: "Missing platform or handle." }, { status: 400 });
  }

  try {
    const store = getStore();
    const saved: TrackedCreator[] = [];
    for (const d of docs) {
      const existing = await store.get<TrackedCreator>(COLLECTION, d.id);
      const merged: TrackedCreator = {
        ...existing,
        ...d,
        // keep what we already know if the new payload is thinner
        followers: d.followers || existing?.followers || 0,
        tier: d.followers ? d.tier : existing?.tier ?? d.tier,
        thumbnail: d.thumbnail ?? existing?.thumbnail,
        url: d.url ?? existing?.url,
        personaId: d.personaId ?? existing?.personaId,
        name: d.name !== d.handle ? d.name : existing?.name ?? d.name,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
      };
      saved.push(await store.upsert(COLLECTION, merged));
    }
    return NextResponse.json(Array.isArray(body?.creators) ? { creators: saved } : { creator: saved[0] }, { status: 201 });
  } catch (err) {
    console.error("[tracked-creators] save failed", err);
    return NextResponse.json({ error: "Couldn't save this creator. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await getStore().remove(COLLECTION, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tracked-creators] delete failed", err);
    return NextResponse.json({ error: "Couldn't remove this creator. Please try again." }, { status: 500 });
  }
}
