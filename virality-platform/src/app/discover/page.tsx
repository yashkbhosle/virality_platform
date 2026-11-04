"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Compass, Database, Info, Instagram, Link2, Loader2, RefreshCw, RotateCcw, Search, Youtube } from "lucide-react";
import { CreatorCard } from "@/components/discover/creator-card";
import {
  DEFAULT_TIERS, TIERS, parseProfileUrls,
  type CreatorPlatform, type DiscoverResult, type DiscoveredCreator, type SizeTier,
} from "@/lib/creators-shared";
import { listTracked, migrateLegacyWatchlist, trackCreator } from "@/lib/tracked-creators-client";
import { usePersonas } from "@/lib/use-personas";

type Tab = "describe" | "url";

// Rough quota footprint per run (see DISCOVERY_LIMITS in lib/discover.ts). Counts only, no prices.
const YT_UNITS = 1210;
const IG_POSTS = 6 * 60;
const IG_PROFILES = 25;

function useTracking(personaId: string | null) {
  const [trackedKeys, setTrackedKeys] = useState<Set<string>>(new Set());
  const [trackingKey, setTrackingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    migrateLegacyWatchlist()
      .then(() => listTracked())
      .then((list) => setTrackedKeys(new Set(list.map((c) => c.id))))
      .catch(() => {});
  }, []);

  const track = async (c: DiscoveredCreator) => {
    setTrackingKey(c.key);
    setError(null);
    try {
      const saved = await trackCreator({
        platform: c.platform, handle: c.handle, channelId: c.channelId, name: c.name, followers: c.followers,
        thumbnail: c.thumbnail, url: c.url, personaId: personaId ?? undefined,
      });
      setTrackedKeys((prev) => new Set(prev).add(saved.id));
    } catch {
      setError("Couldn't track this creator. Please try again.");
    } finally {
      setTrackingKey(null);
    }
  };
  return { trackedKeys, trackingKey, track, error };
}

export default function DiscoverPage() {
  const { active, activeId } = usePersonas();
  const [tab, setTab] = useState<Tab>("describe");

  // Describe tab: prefilled from the active persona until the user types.
  const [typed, setTyped] = useState<string | null>(null);
  const description = typed ?? active?.niche ?? "";
  const [platforms, setPlatforms] = useState<CreatorPlatform[]>(["youtube", "instagram"]);
  const [tiers, setTiers] = useState<SizeTier[]>(DEFAULT_TIERS);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoverResult | null>(null);

  // Add URL tab
  const [urlText, setUrlText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<{ creators: DiscoveredCreator[]; notFound: string[]; notes: string[] } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const { trackedKeys, trackingKey, track, error: trackError } = useTracking(activeId);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const find = async (refresh = false) => {
    setLoading(true);
    setElapsed(0);
    setError(null);
    if (!refresh) setResult(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, personaId: activeId ?? undefined, platforms, tiers, refresh }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't search for creators right now.");
      setResult(data as DiscoverResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't search for creators right now.");
    } finally {
      setLoading(false);
    }
  };

  const resolve = async () => {
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    try {
      const res = await fetch("/api/discover/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: urlText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't look up those profiles.");
      setResolved(data);
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "We couldn't look up those profiles.");
    } finally {
      setResolving(false);
    }
  };

  const parsedCount = parseProfileUrls(urlText).length;
  const total = result?.tiers.reduce((s, t) => s + t.creators.length, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-500">
            <Compass className="h-5 w-5 text-white" />
          </span>
          Discover Creators
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your niche and find creators worth studying, grouped by size so you can learn from people close to your level.
        </p>
      </div>

      <div className="glass flex w-full gap-1 rounded-2xl p-1 sm:w-fit">
        {([["describe", "Describe", Search], ["url", "Add URL", Link2]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all sm:flex-none ${
              tab === id ? "bg-gradient-to-r from-red-500 to-orange-500 text-white" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {trackError && <p className="text-xs text-rose-600 dark:text-rose-300">{trackError}</p>}

      {tab === "describe" && (
        <>
          <div className="glass space-y-5 rounded-2xl p-6">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Your niche</label>
              <textarea value={description} onChange={(e) => setTyped(e.target.value)} rows={2}
                placeholder="e.g. I make content about mortgage tips for first-time buyers in Canada"
                className="w-full resize-none rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none focus:border-orange-500/50" />
              {active && typed === null && (
                <p className="mt-1 text-[11px] text-muted-foreground">Prefilled from your persona “{active.name}”.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-6">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Platforms</p>
                <div className="flex gap-2">
                  {([["youtube", "YouTube", Youtube], ["instagram", "Instagram", Instagram]] as const).map(([id, label, Icon]) => {
                    const on = platforms.includes(id);
                    return (
                      <button key={id} onClick={() => toggle(platforms, id, setPlatforms)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                          on ? "border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-200" : "border-border text-muted-foreground hover:text-foreground"
                        }`}>
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Creator size</p>
                <div className="flex flex-wrap gap-2">
                  {TIERS.map((t) => {
                    const on = tiers.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => toggle(tiers, t.id, setTiers)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                          on ? "border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-200" : "border-border text-muted-foreground hover:text-foreground"
                        }`}>
                        {t.label} <span className="opacity-60">{t.range}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Each new search uses about {platforms.includes("youtube") ? `${YT_UNITS.toLocaleString()} of your 10,000 daily YouTube API units` : "no YouTube quota"}
                {platforms.includes("instagram") ? ` and ~${IG_POSTS} Instagram posts + up to ${IG_PROFILES} profile lookups on Apify` : ""}.
                Results are cached for 24 hours, and changing the size chips never re-runs the search.
              </p>
            </div>

            <button onClick={() => find(false)} disabled={loading || description.trim().length < 8 || platforms.length === 0 || tiers.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-50">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching… {elapsed}s</> : <><Search className="h-4 w-4" /> Find creators</>}
            </button>
            {loading && <p className="text-center text-xs text-muted-foreground">This can take 30–60s while we search YouTube and Instagram.</p>}
          </div>

          {error && (
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-sm">
              <span className="text-rose-600 dark:text-rose-300">{error}</span>
              <button onClick={() => find(false)} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {total} creator{total === 1 ? "" : "s"} found
                  {result.excludedAdDriven > 0 && ` · ${result.excludedAdDriven} ad-driven channel${result.excludedAdDriven === 1 ? "" : "s"} hidden`}
                </span>
                {result.fromCache && (
                  <span className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5" /> Results from cache ({new Date(result.cachedAt).toLocaleString()})
                    <button onClick={() => find(true)} disabled={loading} className="inline-flex items-center gap-1 underline disabled:opacity-50">
                      <RefreshCw className="h-3 w-3" /> Refresh
                    </button>
                  </span>
                )}
              </div>

              {result.notes.map((n) => (
                <p key={n} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">{n}</p>
              ))}

              {total === 0 && (
                <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
                  No creators matched in these sizes. Try adding more size tiers or describing your niche a little more broadly.
                </div>
              )}

              {result.tiers.filter((t) => t.creators.length > 0).map((t) => {
                const info = TIERS.find((x) => x.id === t.tier)!;
                return (
                  <section key={t.tier} className="space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {info.label} creators · {info.range} followers · {t.creators.length}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {t.creators.map((c) => (
                        <CreatorCard key={c.key} creator={c} tracked={trackedKeys.has(c.key)} tracking={trackingKey === c.key} onTrack={() => track(c)} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {result.queries.youtubeQueries.length + result.queries.instagramHashtags.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">What we searched</summary>
                  <p className="mt-2">YouTube: {result.queries.youtubeQueries.join(" · ") || "–"}</p>
                  <p className="mt-1">Instagram: {result.queries.instagramHashtags.map((h) => `#${h}`).join(" ") || "–"}</p>
                </details>
              )}

              {trackedKeys.size > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Tracked creators show up in your <Link href="/watchlist" className="underline">Watchlist</Link>.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {tab === "url" && (
        <>
          <div className="glass space-y-4 rounded-2xl p-6">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Profile links, one per line</label>
              <textarea value={urlText} onChange={(e) => setUrlText(e.target.value)} rows={5}
                placeholder={"https://www.youtube.com/@handle\nhttps://www.instagram.com/username/"}
                className="w-full resize-y rounded-xl border border-border bg-background/50 px-4 py-3 font-mono text-xs outline-none focus:border-orange-500/50" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {parsedCount > 0 ? `${parsedCount} profile${parsedCount === 1 ? "" : "s"} recognised.` : "Supports youtube.com/@handle, youtube.com/channel/UC… and instagram.com/username."}
              </p>
            </div>
            <button onClick={resolve} disabled={resolving || parsedCount === 0}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-sm font-semibold text-white disabled:opacity-50">
              {resolving ? <><Loader2 className="h-4 w-4 animate-spin" /> Looking up profiles…</> : <><Link2 className="h-4 w-4" /> Parse</>}
            </button>
          </div>

          {resolveError && (
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-sm">
              <span className="text-rose-600 dark:text-rose-300">{resolveError}</span>
              <button onClick={resolve} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          )}

          {resolved && (
            <div className="space-y-4">
              {[...resolved.notes, ...(resolved.notFound.length ? [`Couldn't find: ${resolved.notFound.join(", ")}`] : [])].map((n) => (
                <p key={n} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">{n}</p>
              ))}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resolved.creators.map((c) => (
                  <CreatorCard key={c.key} creator={c} tracked={trackedKeys.has(c.key)} tracking={trackingKey === c.key} onTrack={() => track(c)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
