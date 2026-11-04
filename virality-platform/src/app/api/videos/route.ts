import { NextResponse } from "next/server";
import { getVideo, listVideos, saveVideos } from "@/lib/pipeline-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const configName = searchParams.get("configName");
  const creator = searchParams.get("creator");

  let videos = await listVideos();

  if (configName) videos = videos.filter((v) => v.configName === configName);
  if (creator) videos = videos.filter((v) => v.creator === creator);

  // Sort by dateAdded desc, then views desc
  videos.sort((a, b) => {
    const dateDiff = (b.dateAdded || "").localeCompare(a.dateAdded || "");
    if (dateDiff !== 0) return dateDiff;
    return b.views - a.views;
  });

  return NextResponse.json(videos);
}

export async function PATCH(request: Request) {
  const { id, starred } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const video = await getVideo(id);
  if (!video) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = { ...video, starred: !!starred };
  await saveVideos([updated]);
  return NextResponse.json(updated);
}
