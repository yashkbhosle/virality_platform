import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { deleteConfig, getConfig, listConfigs, saveConfig } from "@/lib/pipeline-data";
import type { Config } from "@/lib/types";

export const dynamic = "force-dynamic";

const SAVE_ERROR = "Couldn't save right now. Please try again in a minute.";

export async function GET() {
  try {
    return NextResponse.json(await listConfigs());
  } catch (err) {
    console.error("[configs] list failed", err);
    return NextResponse.json({ error: "Couldn't load configs right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const newConfig: Config = {
    id: uuid(),
    configName: String(body.configName ?? "").trim(),
    creatorsCategory: String(body.creatorsCategory ?? "").trim(),
    analysisInstruction: String(body.analysisInstruction ?? ""),
    newConceptsInstruction: String(body.newConceptsInstruction ?? ""),
  };
  if (!newConfig.configName) return NextResponse.json({ error: "Enter a config name." }, { status: 400 });
  try {
    await saveConfig(newConfig);
    return NextResponse.json(newConfig, { status: 201 });
  } catch (err) {
    console.error("[configs] add failed", err);
    return NextResponse.json({ error: SAVE_ERROR }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const current = body.id ? await getConfig(String(body.id)) : null;
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await saveConfig({ ...current, ...body, id: current.id }));
  } catch (err) {
    console.error("[configs] update failed", err);
    return NextResponse.json({ error: SAVE_ERROR }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteConfig(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[configs] delete failed", err);
    return NextResponse.json({ error: SAVE_ERROR }, { status: 500 });
  }
}
