import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { SCRIPT_COLLECTION, type SavedScript } from "@/lib/script-flow";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const script = await getStore().get<SavedScript>(SCRIPT_COLLECTION, id).catch(() => null);
  if (!script) return NextResponse.json({ error: "Script not found." }, { status: 404 });
  return NextResponse.json({ script });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await getStore().remove(SCRIPT_COLLECTION, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[scripts] delete failed", err);
    return NextResponse.json({ error: "Couldn't delete this script. Please try again." }, { status: 500 });
  }
}
