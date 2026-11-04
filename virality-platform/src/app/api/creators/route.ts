import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { deleteCreator, getCreator, listCreators, saveCreator } from "@/lib/pipeline-data";
import { scrapeCreatorStats } from "@/lib/apify";
import type { Creator } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SAVE_ERROR = "Couldn't save right now. Please try again in a minute.";

function cleanUsername(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  try {
    let creators = await listCreators();
    if (category) creators = creators.filter((c) => c.category === category);
    return NextResponse.json(creators);
  } catch (err) {
    console.error("[creators] list failed", err);
    return NextResponse.json({ error: "Couldn't load creators right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = cleanUsername(body.username);
  const category = String(body.category ?? "").trim();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) {
    return NextResponse.json({ error: "Enter a valid Instagram username, like natgeo." }, { status: 400 });
  }
  if (!category) return NextResponse.json({ error: "Enter a category." }, { status: 400 });

  try {
    const existing = (await listCreators()).find((c) => c.username.toLowerCase() === username && c.category === category);
    if (existing) return NextResponse.json({ error: `@${username} is already in "${category}".` }, { status: 409 });

    let creator: Creator = {
      id: uuid(),
      username,
      category,
      profilePicUrl: "",
      followers: 0,
      reelsCount30d: 0,
      avgViews30d: 0,
      lastScrapedAt: "",
    };
    // Save first, so the creator is kept even if the stats lookup fails.
    await saveCreator(creator);

    try {
      const stats = await scrapeCreatorStats(username);
      creator = {
        ...creator,
        profilePicUrl: stats.profilePicUrl,
        followers: stats.followers,
        reelsCount30d: stats.reelsCount30d,
        avgViews30d: stats.avgViews30d,
        lastScrapedAt: new Date().toISOString(),
      };
      await saveCreator(creator);
    } catch (err) {
      console.error(`[creators] stats lookup failed for @${username}`, err);
    }
    return NextResponse.json(creator, { status: 201 });
  } catch (err) {
    console.error("[creators] add failed", err);
    return NextResponse.json({ error: SAVE_ERROR }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const current = body.id ? await getCreator(String(body.id)) : null;
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await saveCreator({ ...current, ...body, id: current.id });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[creators] update failed", err);
    return NextResponse.json({ error: SAVE_ERROR }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteCreator(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[creators] delete failed", err);
    return NextResponse.json({ error: SAVE_ERROR }, { status: 500 });
  }
}
