"use client";

import Link from "next/link";
import { Check, ExternalLink, Instagram, Loader2, Play, Plus, Youtube } from "lucide-react";
import { formatCount, tierLabel, type DiscoveredCreator } from "@/lib/creators-shared";

interface CreatorCardProps {
  creator: DiscoveredCreator;
  tracked: boolean;
  tracking: boolean;
  onTrack: () => void;
}

function avatarSrc(c: DiscoveredCreator) {
  if (!c.thumbnail) return "";
  // Instagram CDN images block hotlinking; route them through the existing proxy.
  return c.platform === "instagram" ? `/api/proxy-image?url=${encodeURIComponent(c.thumbnail)}` : c.thumbnail;
}

export function CreatorCard({ creator: c, tracked, tracking, onTrack }: CreatorCardProps) {
  const PlatformIcon = c.platform === "youtube" ? Youtube : Instagram;
  const src = avatarSrc(c);
  const topVideosHref =
    c.platform === "youtube" && c.channelId
      ? `/keyword-research?channel=${encodeURIComponent(c.channelId)}&name=${encodeURIComponent(c.name)}`
      : null;

  return (
    <div className="glass flex flex-col rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <PlatformIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PlatformIcon className={`h-3.5 w-3.5 shrink-0 ${c.platform === "youtube" ? "text-red-500" : "text-pink-500"}`} />
            <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold hover:underline">
              {c.name}
            </a>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {c.handle.startsWith("UC") ? "" : `@${c.handle} · `}
            {tierLabel(c.tier)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label={c.platform === "youtube" ? "Subscribers" : "Followers"} value={formatCount(c.followers)} />
        <Stat label="Avg views" value={c.avgViewsPerVideo ? formatCount(c.avgViewsPerVideo) : "–"} />
        <Stat label="Views / follower" value={c.viewsPerFollower ? `${c.viewsPerFollower.toFixed(1)}×` : "–"} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.why}</p>

      <div className="mt-auto flex gap-2 pt-4">
        <button
          onClick={onTrack}
          disabled={tracked || tracking}
          className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-all ${
            tracked
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-gradient-to-r from-red-500 to-orange-500 text-white"
          }`}
        >
          {tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tracked ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {tracked ? "Tracking" : "Track"}
        </button>
        {topVideosHref ? (
          <Link href={topVideosHref}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:text-foreground">
            <Play className="h-3.5 w-3.5" /> Top videos
          </Link>
        ) : (
          <a href={c.platform === "instagram" ? `https://www.instagram.com/${c.handle}/reels/` : c.url} target="_blank" rel="noreferrer"
            className="flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" /> Top videos
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-1.5">
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
