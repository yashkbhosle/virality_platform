"use client";

// Browser helpers for /api/tracked-creators, plus the one-time import of the
// old localStorage watchlist ("virality_watchlist").

import type { CreatorPlatform, TrackedCreator } from "./creators-shared";

const LEGACY_KEY = "virality_watchlist";
const MIGRATED_KEY = "viralos_watchlist_migrated";

export async function listTracked(platform?: CreatorPlatform): Promise<TrackedCreator[]> {
  const res = await fetch(`/api/tracked-creators${platform ? `?platform=${platform}` : ""}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't load your tracked creators.");
  return data.creators ?? [];
}

export async function trackCreator(input: Partial<TrackedCreator> & { platform: CreatorPlatform; handle: string }): Promise<TrackedCreator> {
  const res = await fetch("/api/tracked-creators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.creator) throw new Error(data.error || "Couldn't save this creator.");
  return data.creator;
}

export async function untrackCreator(id: string): Promise<void> {
  const res = await fetch(`/api/tracked-creators?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't remove this creator.");
}

let migration: Promise<void> | null = null;

/** Import any legacy localStorage watchlist entries once. Safe to call repeatedly. */
export function migrateLegacyWatchlist(): Promise<void> {
  if (migration) return migration;
  migration = (async () => {
    let raw: string | null = null;
    try {
      if (localStorage.getItem(MIGRATED_KEY)) return;
      raw = localStorage.getItem(LEGACY_KEY);
    } catch {
      return;
    }
    const entries: { handle?: string; label?: string; platform?: string; addedAt?: string }[] = (() => {
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const creators = entries
      .filter((e) => e.handle)
      .map((e) => ({
        platform: e.platform === "instagram" ? "instagram" : "youtube",
        handle: e.handle,
        name: e.label || e.handle,
      }));
    if (creators.length) {
      const res = await fetch("/api/tracked-creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creators }),
      });
      if (!res.ok) {
        migration = null; // retry next time
        return;
      }
    }
    try {
      localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  })();
  return migration;
}
