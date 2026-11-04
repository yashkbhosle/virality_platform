import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getStore } from "@/lib/store";
import { runDiscovery, filterTiers } from "@/lib/discover";
import { PERSONA_COLLECTION } from "@/lib/persona";
import { TIERS, type CreatorPlatform, type DiscoverResult, type SizeTier } from "@/lib/creators-shared";
import type { Persona } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CACHE_COLLECTION = "discover_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheDoc {
  id: string;
  createdAt: string;
  input: { description: string; platforms: CreatorPlatform[] };
  result: Omit<DiscoverResult, "fromCache" | "cachedAt">;
}

function personaDescription(p: Persona): string {
  return [p.niche, p.avatar.who && `Audience: ${p.avatar.who}`, p.topics.length && `Topics: ${p.topics.join(", ")}`]
    .filter(Boolean)
    .join(". ");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const platforms: CreatorPlatform[] = (Array.isArray(body?.platforms) ? body.platforms : ["youtube", "instagram"])
    .filter((p: unknown): p is CreatorPlatform => p === "youtube" || p === "instagram");
  const tierIds = new Set(TIERS.map((t) => t.id));
  const tiers: SizeTier[] = (Array.isArray(body?.tiers) ? body.tiers : []).filter((t: unknown): t is SizeTier =>
    tierIds.has(t as SizeTier)
  );
  const refresh = body?.refresh === true;

  let description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : "";
  const store = getStore();
  if (!description && typeof body?.personaId === "string") {
    const persona = await store.get<Persona>(PERSONA_COLLECTION, body.personaId).catch(() => null);
    if (persona) description = personaDescription(persona);
  }

  if (description.length < 8) {
    return NextResponse.json({ error: "Describe your niche in a sentence so we know who to look for." }, { status: 400 });
  }
  if (platforms.length === 0) {
    return NextResponse.json({ error: "Pick at least one platform." }, { status: 400 });
  }

  // Cache the full pipeline per (niche, platforms); tiers are filtered afterwards so
  // changing tier chips never costs extra API quota.
  const sortedPlatforms = [...platforms].sort();
  const cacheId = createHash("sha256")
    .update(JSON.stringify({ d: description.toLowerCase().replace(/\s+/g, " "), p: sortedPlatforms }))
    .digest("hex")
    .slice(0, 32);

  if (!refresh) {
    const cached = await store.get<CacheDoc>(CACHE_COLLECTION, cacheId).catch(() => null);
    if (cached && Date.now() - new Date(cached.createdAt).getTime() < CACHE_TTL_MS) {
      return NextResponse.json(filterTiers({ ...cached.result, fromCache: true, cachedAt: cached.createdAt }, tiers));
    }
  }

  try {
    const result = await runDiscovery(description, sortedPlatforms, { fresh: refresh });
    const createdAt = new Date().toISOString();
    await store
      .upsert<CacheDoc>(CACHE_COLLECTION, { id: cacheId, createdAt, input: { description, platforms: sortedPlatforms }, result })
      .catch((err) => console.error("[discover] cache write failed", err));
    return NextResponse.json(filterTiers({ ...result, fromCache: false, cachedAt: createdAt }, tiers));
  } catch (err) {
    console.error("[discover] failed", err);
    return NextResponse.json(
      { error: "We couldn't search for creators right now. Please try again in a minute." },
      { status: 502 }
    );
  }
}
