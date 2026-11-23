// Save profile pictures for creators added before pictures were stored in the database.
// Fetches fresh picture links for every Instagram creator (Watchlist and Creators page)
// in one Apify run, then saves each picture. Uses the repo-root .env.
//
//   npm run backfill:avatars
//
// Costs one Apify profile lookup per creator that has no saved picture yet.

import path from "path";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), "..", ".env") });

(async () => {
  const { getStore } = await import("../src/lib/store");
  const { getAvatar, saveAvatarFromUrl } = await import("../src/lib/avatar-store");
  const { fetchInstagramProfiles } = await import("../src/lib/discover");
  const { listCreators, saveCreator } = await import("../src/lib/pipeline-data");
  type Tracked = { id: string; platform: string; handle: string; thumbnail?: string; avatarSavedAt?: string };

  const store = getStore();
  const tracked = (await store.list<Tracked>("tracked_creators")).filter((c) => c.platform === "instagram");
  const pipeline = await listCreators();

  const handles = new Set<string>();
  for (const c of tracked) handles.add(c.handle.toLowerCase());
  for (const c of pipeline) handles.add(c.username.toLowerCase());
  const missing: string[] = [];
  for (const h of handles) if (!(await getAvatar(`instagram:${h}`))) missing.push(h);
  console.log(`${handles.size} Instagram creators, ${missing.length} without a saved picture.`);
  if (!missing.length) return;

  const profiles = await fetchInstagramProfiles(missing, { fresh: true });
  const picByHandle = new Map<string, string>();
  for (const p of profiles as { username?: string; profilePicUrl?: string; profilePicUrlHD?: string }[]) {
    const pic = p.profilePicUrlHD || p.profilePicUrl;
    if (p.username && pic) picByHandle.set(p.username.toLowerCase(), pic);
  }

  let saved = 0;
  for (const h of missing) {
    const pic = picByHandle.get(h);
    const at = pic ? await saveAvatarFromUrl(`instagram:${h}`, pic) : null;
    console.log(`${at ? "saved  " : "missing"} @${h}`);
    if (!at) continue;
    saved++;
    for (const c of tracked.filter((t) => t.handle.toLowerCase() === h)) {
      await store.upsert("tracked_creators", { ...c, thumbnail: pic, avatarSavedAt: at });
    }
    for (const c of pipeline.filter((p) => p.username.toLowerCase() === h)) {
      await saveCreator({ ...c, profilePicUrl: pic! });
    }
  }
  console.log(`Done: ${saved}/${missing.length} pictures saved.`);
})().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
