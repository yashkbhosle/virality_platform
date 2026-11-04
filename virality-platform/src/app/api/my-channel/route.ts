import { NextRequest, NextResponse } from "next/server";
import { ChannelNotFoundError, connectChannel, loadChannelsWithData, removeChannel } from "@/lib/my-channel";
import { parseChannelInput, type MyPlatform } from "@/lib/my-channel-shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const personaId = new URL(req.url).searchParams.get("personaId") ?? undefined;
  try {
    return NextResponse.json({ channels: await loadChannelsWithData(personaId) });
  } catch (err) {
    console.error("[my-channel] list failed", err);
    return NextResponse.json({ error: "Couldn't load your channels. Please try again." }, { status: 500 });
  }
}

/** Connect an account: { personaId, platform, handle } — looks it up and takes the first snapshot. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const personaId = typeof body?.personaId === "string" ? body.personaId : "";
  const platform: MyPlatform | null = body?.platform === "youtube" || body?.platform === "instagram" ? body.platform : null;
  if (!personaId) return NextResponse.json({ error: "Pick a persona first.", needsPersona: true }, { status: 400 });
  if (!platform) return NextResponse.json({ error: "Choose YouTube or Instagram." }, { status: 400 });
  const parsed = parseChannelInput(platform, typeof body?.handle === "string" ? body.handle : "");
  if (!parsed) {
    return NextResponse.json(
      { error: platform === "youtube" ? "Enter your YouTube @handle or channel link." : "Enter your Instagram username." },
      { status: 400 }
    );
  }
  try {
    const result = await connectChannel({ personaId, platform, ...parsed });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ChannelNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("[my-channel] connect failed", err);
    return NextResponse.json({ error: "Couldn't load that account right now. Please try again in a minute." }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await removeChannel(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[my-channel] remove failed", err);
    return NextResponse.json({ error: "Couldn't disconnect this account. Please try again." }, { status: 500 });
  }
}
