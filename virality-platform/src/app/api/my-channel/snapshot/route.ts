import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { takeSnapshot } from "@/lib/my-channel";
import { MY_CHANNELS, type MyChannel } from "@/lib/my-channel-shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily cron (Vercel sends GET): /api/my-channel/snapshot?all=1
 * Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (new URL(req.url).searchParams.get("all") !== "1") {
    return NextResponse.json({ error: "Use ?all=1" }, { status: 400 });
  }
  const channels = await getStore().list<MyChannel>(MY_CHANNELS);
  const results: { id: string; ok: boolean }[] = [];
  // One at a time to stay gentle on YouTube quota and Apify concurrency.
  for (const ch of channels) {
    try {
      await takeSnapshot(ch);
      results.push({ id: ch.id, ok: true });
    } catch (err) {
      console.error(`[my-channel] cron snapshot failed for ${ch.id}`, err);
      results.push({ id: ch.id, ok: false });
    }
  }
  console.info(`[my-channel] cron: ${results.filter((r) => r.ok).length}/${results.length} snapshots taken`);
  return NextResponse.json({ results });
}

/** Manual "Refresh now" from the UI: { id } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const channel = id ? await getStore().get<MyChannel>(MY_CHANNELS, id).catch(() => null) : null;
  if (!channel) return NextResponse.json({ error: "That account isn't connected any more." }, { status: 404 });
  try {
    return NextResponse.json({ snapshot: await takeSnapshot(channel) });
  } catch (err) {
    console.error("[my-channel] snapshot failed", err);
    return NextResponse.json({ error: "Couldn't refresh your stats right now. Please try again in a minute." }, { status: 502 });
  }
}
