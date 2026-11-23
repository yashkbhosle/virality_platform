import { NextRequest } from "next/server";
import { getAvatar } from "@/lib/avatar-store";

export const dynamic = "force-dynamic";

// GET /api/avatar?id=instagram:natgeo → the saved profile picture, or 404.
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")?.trim().toLowerCase();
  if (!id || id.length > 200) return new Response(null, { status: 400 });
  try {
    const avatar = await getAvatar(id);
    if (!avatar) return new Response(null, { status: 404 });
    return new Response(Buffer.from(avatar.data, "base64"), {
      headers: {
        "Content-Type": avatar.contentType,
        // Private: the app is behind a login. A new picture gets a new ?v= in the page.
        "Cache-Control": "private, max-age=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[avatar] read failed", err);
    return new Response(null, { status: 500 });
  }
}
