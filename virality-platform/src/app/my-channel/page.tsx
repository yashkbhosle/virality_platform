"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen, CalendarClock, ExternalLink, Flame, Instagram, LineChart as LineChartIcon, Loader2, RefreshCw, Trash2, TrendingDown, TrendingUp, UserRound, Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnalysisPanel, type TranscriptData } from "@/components/analysis-panel";
import { BarChart, LineChart } from "@/components/my-channel/charts";
import { formatCount } from "@/lib/creators-shared";
import { saveRecentAnalysis } from "@/lib/recent-analyses";
import { usePersonas } from "@/lib/use-personas";
import { VERDICT_LABEL } from "@/lib/virality";
import {
  bestRecentPost, computeKpis, dailyPoints, followerSeries, rankPosts, viewsByDay,
  type ChannelWithData, type Kpi, type MyPlatform, type RankedPost,
} from "@/lib/my-channel-shared";

const LABEL = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function KpiCard({ label, kpi, hint, signed }: { label: string; kpi: Kpi; hint?: string; signed?: boolean }) {
  const up = (kpi.changePct ?? 0) >= 0;
  return (
    <div className="glass rounded-2xl p-4 space-y-1">
      <p className={LABEL}>{label}</p>
      <p className="text-2xl font-bold tabular-nums">
        {kpi.value === null ? "—" : `${signed && kpi.value > 0 ? "+" : ""}${formatCount(kpi.value)}`}
      </p>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        {kpi.changePct !== null ? (
          <>
            {up ? <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-300" /> : <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-300" />}
            <span className={up ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-300"}>
              {up ? "+" : ""}{kpi.changePct.toFixed(0)}%
            </span>
            vs previous 7 days
          </>
        ) : kpi.previous === 0 && kpi.value !== null ? (
          "vs 0 in the previous 7 days"
        ) : (
          hint ?? "No previous 7 days to compare yet"
        )}
      </p>
    </div>
  );
}

function PostRow({ post, rank, channel, onAnalyzed }: {
  post: RankedPost; rank: number; channel: ChannelWithData["channel"]; onAnalyzed?: () => void;
}) {
  const [analysis, setAnalysis] = useState<TranscriptData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const m = post.metrics;

  const analyze = (fresh = false) => {
    if (!fresh && analysis) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    setError("");
    const isYT = channel.platform === "youtube";
    fetch(isYT ? "/api/transcript" : "/api/ig-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isYT
          ? { url: post.url, title: post.title, channelTitle: channel.title, views: post.views, likes: post.likes, comments: post.comments, metrics: m, fresh }
          : { url: post.url, caption: post.title, plays: post.views, likes: post.likes, comments: post.comments, username: channel.handle, metrics: m, fresh }
      ),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error);
        setAnalysis(d);
        setOpen(true);
        saveRecentAnalysis({
          url: post.url, title: post.title, creator: isYT ? channel.title : `@${channel.handle}`, views: post.views, platform: channel.platform, analysis: d.analysis,
        });
        onAnalyzed?.();
      })
      .catch((e: unknown) => setError((e instanceof Error && e.message) || "Couldn't analyze this post right now. Please try again."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <span className="w-6 shrink-0 text-center text-xs font-bold text-muted-foreground">#{rank}</span>
        {post.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbnails
          <img src={post.thumbnail} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-lg object-cover bg-white/[0.04]" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-white/[0.04]" />
        )}
        <div className="min-w-0 flex-1">
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-medium hover:underline">
            <span className="truncate">{post.title}</span> <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
          <p className="text-[11px] text-muted-foreground">
            {formatCount(post.views)} views · {formatCount(post.likes)} likes · {formatCount(post.comments)} comments · {timeAgo(post.publishedAt)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] px-2 py-0.5">
              <Flame className="h-2.5 w-2.5" /> {VERDICT_LABEL[m.verdict]} · {m.viralityScore}
            </span>
            <span className="text-muted-foreground">{m.engagementRate}% engagement</span>
            {m.outlierScore !== null && <span className="text-muted-foreground">{m.outlierScore}× your average</span>}
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-full text-xs" onClick={() => analyze()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
          {analysis ? (open ? "Hide" : "Show") : "Analyze"}
        </Button>
      </div>
      {error && <p className="px-4 pb-3 text-xs text-red-600 dark:text-red-300">{error} <button className="underline" onClick={() => analyze()}>Retry</button></p>}
      {open && analysis && (
        <AnalysisPanel
          data={analysis}
          source={{ url: post.url, title: post.title, views: post.views }}
          onReanalyze={() => analyze(true)}
          reanalyzing={loading}
          onDownload={() => {
            const blob = new Blob([analysis.transcript], { type: "text/plain" });
            const u = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = u;
            a.download = "transcript.txt";
            a.click();
          }}
        />
      )}
    </div>
  );
}

function ChannelDashboard({ data, onRefreshed, onRemoved }: { data: ChannelWithData; onRefreshed: () => void; onRemoved: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const { channel, latest, history } = data;
  const kpis = computeKpis(data);
  const { posts: ranked, avgViews } = rankPosts(latest);
  const best = bestRecentPost(ranked);
  const days = dailyPoints(history).length;
  const followers = followerSeries(history);
  const views30 = viewsByDay(latest?.recentPosts ?? []);
  const isYT = channel.platform === "youtube";

  const refresh = () => {
    setRefreshing(true);
    setError("");
    fetch("/api/my-channel/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: channel.id }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error);
        onRefreshed();
      })
      .catch((e: unknown) => setError((e instanceof Error && e.message) || "Couldn't refresh your stats right now. Please try again."))
      .finally(() => setRefreshing(false));
  };

  const remove = () => {
    if (!window.confirm(`Disconnect ${channel.title ?? channel.handle}? Its saved history will be deleted.`)) return;
    fetch(`/api/my-channel?id=${encodeURIComponent(channel.id)}`, { method: "DELETE" }).then(() => onRemoved());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {channel.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote CDN avatar
          <img src={channel.thumbnail} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-full object-cover bg-white/[0.04]" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06]">{isYT ? <Youtube className="h-5 w-5" /> : <Instagram className="h-5 w-5" />}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{channel.title ?? channel.handle}</p>
          <p className="text-xs text-muted-foreground">
            {isYT ? "YouTube" : "Instagram"} · @{channel.handle}{latest ? ` · updated ${timeAgo(latest.takenAt)}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full text-xs" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {refreshing ? (isYT ? "Refreshing…" : "Refreshing (about a minute)…") : "Refresh now"}
        </Button>
        <button onClick={remove} title="Disconnect" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={isYT ? "Total subscribers" : "Total followers"} kpi={kpis.followers} hint={days < 2 ? "Tracking since today" : undefined} />
        <KpiCard label={isYT ? "Subscribers gained (7d)" : "Followers gained (7d)"} kpi={kpis.followersGained7d} signed hint={days < 2 ? "Needs 2+ days of data" : undefined} />
        <KpiCard label="Views (7d)" kpi={kpis.views7d} hint="On posts published this week" />
        <KpiCard label="Posts (7d)" kpi={kpis.posts7d} />
      </div>

      {days < 2 && (
        <div className="glass flex items-start gap-2 rounded-2xl p-4 text-sm">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-300" />
          <span>Come back tomorrow, trends need 2+ days of data. Stats are saved once a day automatically when the daily job is set up, or whenever you click Refresh now.</span>
        </div>
      )}

      {best && (best.metrics.outlierScore ?? 0) >= 1.5 && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm">
          <p className="font-semibold text-orange-700 dark:text-orange-200">
            🔥 Your best post this month got {best.metrics.outlierScore}× your average. Make more like this.
          </p>
          <p className="mt-0.5 text-muted-foreground">
            “{best.title}”: {formatCount(best.views)} views vs your average of {formatCount(Math.round(avgViews))}. Analyze it below to see why it worked.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold">Views by day</p>
            <p className="text-[11px] text-muted-foreground">Current views of your last {latest?.recentPosts.length ?? 0} posts, by the day they were published (30 days)</p>
          </div>
          {views30.some((d) => d.value > 0)
            ? <BarChart data={views30} unit="views" colorClass="text-orange-500 dark:text-orange-400" label="Views by publish day, last 30 days" width={340} />
            : <p className="py-10 text-center text-sm text-muted-foreground">No posts in the last 30 days.</p>}
        </div>
        <div className="glass rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold">{isYT ? "Subscribers" : "Followers"} gained by day</p>
            <p className="text-[11px] text-muted-foreground">Change between daily snapshots</p>
          </div>
          {followers.length >= 2
            ? <BarChart data={followers.slice(1).map((f) => ({ day: f.day, value: f.gained ?? 0 }))} unit={isYT ? "subscribers" : "followers"} colorClass="text-emerald-600 dark:text-emerald-400" label="Followers gained by day" width={340} />
            : <p className="py-10 text-center text-sm text-muted-foreground">Needs 2+ days of snapshots.</p>}
        </div>
        <div className="glass rounded-2xl p-5 space-y-3 lg:col-span-2">
          <p className="text-sm font-semibold">{isYT ? "Subscribers" : "Followers"} over time</p>
          {followers.length >= 2
            ? <LineChart data={followers.map((f) => ({ day: f.day, value: f.followers }))} unit={isYT ? "subscribers" : "followers"} colorClass="text-emerald-600 dark:text-emerald-400" label="Followers over time" />
            : <p className="py-8 text-center text-sm text-muted-foreground">Needs 2+ days of snapshots.</p>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Your recent posts, ranked by virality score</p>
          {avgViews > 0 && <p className="text-[11px] text-muted-foreground">Your average: {formatCount(Math.round(avgViews))} views per post</p>}
        </div>
        {ranked.length ? (
          ranked.map((p, i) => <PostRow key={p.id} post={p} rank={i + 1} channel={channel} />)
        ) : (
          <p className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">No {isYT ? "videos" : "reels"} found on this account yet.</p>
        )}
      </div>
    </div>
  );
}

function ConnectForm({ personaId, compact, onConnected }: { personaId: string; compact?: boolean; onConnected: () => void }) {
  const [platform, setPlatform] = useState<MyPlatform>("youtube");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = () => {
    if (!handle.trim()) return;
    setBusy(true);
    setError("");
    fetch("/api/my-channel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, platform, handle }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error);
        setHandle("");
        onConnected();
      })
      .catch((e: unknown) => setError((e instanceof Error && e.message) || "Couldn't connect that account. Please try again."))
      .finally(() => setBusy(false));
  };

  return (
    <div className={`glass rounded-2xl ${compact ? "p-4" : "p-6"} space-y-3`}>
      {!compact && (
        <div>
          <h3 className="font-semibold">Connect your account</h3>
          <p className="text-sm text-muted-foreground">Public data only, no login needed. We save a snapshot of your stats each day.</p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex shrink-0 gap-1 rounded-full border border-white/[0.08] p-1">
          {(["youtube", "instagram"] as MyPlatform[]).map((p) => (
            <button
              key={p} onClick={() => setPlatform(p)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${platform === p ? "bg-gradient-to-r from-red-500 to-orange-500 text-white" : "text-muted-foreground"}`}
            >
              {p === "youtube" ? <Youtube className="h-3.5 w-3.5" /> : <Instagram className="h-3.5 w-3.5" />} {p === "youtube" ? "YouTube" : "Instagram"}
            </button>
          ))}
        </div>
        <Input
          value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && connect()}
          placeholder={platform === "youtube" ? "@yourhandle or channel link" : "your_username"} className="h-9 rounded-xl"
        />
        <Button onClick={connect} disabled={busy || !handle.trim()} className="h-9 shrink-0 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90">
          {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {platform === "instagram" ? "Loading (about a minute)…" : "Loading…"}</> : "Connect"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
    </div>
  );
}

export default function MyChannelPage() {
  const { active, personas } = usePersonas();
  const [channels, setChannels] = useState<ChannelWithData[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState("");
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetch(`/api/my-channel?personaId=${encodeURIComponent(activeId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setChannels(d.channels ?? []);
        setLoadError(false);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [activeId, version]);

  const current = channels?.find((c) => c.channel.id === selected) ?? channels?.[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <LineChartIcon className="h-5 w-5 text-white" />
          </span>
          My Channel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">See whether what you post is working, so you can double down or adjust.</p>
      </div>

      {personas === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : !active ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <UserRound className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm">Your channels are linked to a persona. {personas.length ? "Pick one in the sidebar." : "Create one first."}</p>
          <Link href="/persona" className="inline-block rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white">
            {personas.length ? "Manage personas" : "Create persona"}
          </Link>
        </div>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm">Couldn&apos;t load your channels.</p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={reload}>Try again</Button>
        </div>
      ) : channels === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your channels…</p>
      ) : !channels.length ? (
        <ConnectForm personaId={active.id} onConnected={reload} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {channels.map((c) => (
              <button
                key={c.channel.id} onClick={() => setSelected(c.channel.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm ${
                  current?.channel.id === c.channel.id ? "border-transparent bg-gradient-to-r from-red-500 to-orange-500 text-white" : "glass border-white/[0.08] text-muted-foreground"
                }`}
              >
                {c.channel.platform === "youtube" ? <Youtube className="h-3.5 w-3.5" /> : <Instagram className="h-3.5 w-3.5" />}
                {c.channel.title ?? c.channel.handle}
              </button>
            ))}
          </div>
          {current && <ChannelDashboard key={current.channel.id} data={current} onRefreshed={reload} onRemoved={() => { setSelected(""); reload(); }} />}
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">+ Connect another account</summary>
            <div className="mt-3"><ConnectForm personaId={active.id} compact onConnected={reload} /></div>
          </details>
        </>
      )}
    </div>
  );
}
