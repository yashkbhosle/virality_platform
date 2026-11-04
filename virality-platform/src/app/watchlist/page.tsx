"use client";

import { useState, useEffect } from "react";
import {
  Plus, Trash2, RefreshCw, Loader2, Play, Eye, TrendingUp,
  Youtube, ChevronRight, BarChart2, X, Instagram, Users,
  UserCheck, Film, Pencil, BookOpen, Download, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import type { Creator } from "@/lib/types";
import { formatCount, tierLabel, type SizeTier, type TrackedCreator } from "@/lib/creators-shared";
import { listTracked, migrateLegacyWatchlist, trackCreator, untrackCreator } from "@/lib/tracked-creators-client";
import { usePersonas } from "@/lib/use-personas";

function fmt(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

interface WatchlistEntry {
  id: string; handle: string; label: string;
  platform: "youtube" | "instagram"; addedAt: string;
  followers?: number; tier?: SizeTier | null; personaId?: string; thumbnail?: string; url?: string;
}
function toWatchlistEntry(c: TrackedCreator): WatchlistEntry {
  return {
    id: c.id, handle: c.handle, label: c.name, platform: c.platform, addedAt: c.addedAt,
    followers: c.followers, tier: c.tier, personaId: c.personaId, thumbnail: c.thumbnail, url: c.url,
  };
}
interface ChannelStats {
  handle: string; videos: any[]; loading: boolean; error?: string;
  period?: string; topN?: number;
}
interface TranscriptData {
  transcript: string;
  analysis: {
    hook: string; format: string; whyViral: string; keyTopics: string[];
    contentFormat: string; hookType: string; cta: string;
  };
}

// ── Analysis panel ────────────────────────────────────────────────────
function AnalysisPanel({ data, onDownload }: { data: TranscriptData; onDownload: () => void }) {
  const [showFull, setShowFull] = useState(false);
  return (
    <div className="border-t border-white/[0.06] bg-white/[0.01] px-5 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Hook Type", val: data.analysis.hookType, color: "text-orange-400" },
          { label: "Format",    val: data.analysis.format,   color: "text-blue-400"   },
          { label: "CTA",       val: data.analysis.cta,      color: "text-green-400"  },
          { label: "Topics",    val: data.analysis.keyTopics?.slice(0, 2).join(", "), color: "text-purple-400" },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-xs font-semibold ${color} leading-tight`}>{val || "—"}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
          <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider mb-1">🎣 HOOK</p>
          <p className="text-xs leading-relaxed">{data.analysis.hook}</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
          <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-1">🔥 WHY VIRAL</p>
          <p className="text-xs leading-relaxed">{data.analysis.whyViral}</p>
        </div>
        {data.analysis.contentFormat && (
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
            <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider mb-1">📐 CONTENT BREAKDOWN</p>
            <p className="text-xs leading-relaxed">{data.analysis.contentFormat}</p>
          </div>
        )}
        {data.analysis.keyTopics?.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">🏷️ KEY TOPICS</p>
            <div className="flex flex-wrap gap-1.5">
              {data.analysis.keyTopics.map((t, i) => (
                <span key={i} className="text-[11px] bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-0.5">{t}</span>
              ))}
            </div>
          </div>
        )}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">📝 TRANSCRIPT</p>
            <div className="flex gap-2">
              {data.transcript && (
                <button onClick={() => setShowFull(v => !v)} className="text-[10px] text-blue-400 hover:underline">
                  {showFull ? "Show less" : "Show full"}
                </button>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground px-2" onClick={onDownload}>
                <Download className="h-2.5 w-2.5" /> Download CSV
              </Button>
            </div>
          </div>
          {data.transcript ? (
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {showFull ? data.transcript : data.transcript.slice(0, 400) + (data.transcript.length > 400 ? "…" : "")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No transcript — analysis based on video content.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline video modal ────────────────────────────────────────────────
function VideoModal({ video, onClose }: { video: any; onClose: () => void }) {
  const embedId = video.id;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm glass rounded-3xl overflow-hidden border border-white/[0.1]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full glass flex items-center justify-center hover:bg-white/[0.1]">
          <X className="h-4 w-4" />
        </button>
        <div className="aspect-[9/16]">
          <iframe
            src={`https://www.youtube.com/embed/${embedId}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media" allowFullScreen className="w-full h-full"
          />
        </div>
        <div className="p-4 space-y-1">
          <p className="text-sm font-semibold line-clamp-2">{video.title}</p>
          <p className="text-xs text-muted-foreground">{video.channelTitle}</p>
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5 text-red-400 fill-red-400" /><span className="text-sm font-bold">{fmt(video.views)}</span></span>
            <span className="text-xs text-muted-foreground">👍 {fmt(video.likes)}</span>
            <span className="text-xs text-muted-foreground">💬 {fmt(video.comments)}</span>
            <a href={video.url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const PERIOD_LABELS: Record<string, string> = {
  all: "All Time", "14d": "Last 14 Days", "30d": "Last 30 Days", "6mo": "Last 6 Months", "1y": "Last Year",
};
const SORT_LABELS: Record<string, string> = {
  views: "Most Views", newest: "Newest", oldest: "Oldest", engagement: "Engagement Rate",
};

// ── YouTube Watchlist tab ─────────────────────────────────────────────
function YoutubeTab() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [form, setForm] = useState({ handle: "", label: "" });
  const [showing, setShowing] = useState(false);
  const [channelStats, setChannelStats] = useState<Record<string, ChannelStats>>({});
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [transcriptData, setTranscriptData] = useState<Record<string, TranscriptData>>({});
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState<string | null>(null);
  const [modalVideo, setModalVideo] = useState<any>(null);
  // Filter state — applied when clicking Load/Refresh
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterSort, setFilterSort] = useState("views");
  const [filterTopN, setFilterTopN] = useState(20);

  const [listError, setListError] = useState<string | null>(null);
  const { names: personaNames, activeId: activePersonaId } = usePersonas();

  // Tracked creators live in /api/tracked-creators (persisted store).
  // Old localStorage entries are imported once by migrateLegacyWatchlist().
  const loadEntries = () =>
    migrateLegacyWatchlist()
      .then(() => listTracked("youtube"))
      .then((list) => { setEntries(list.map(toWatchlistEntry)); setListError(null); })
      .catch((e: unknown) => setListError(e instanceof Error ? e.message : "Couldn't load your watchlist."));
  useEffect(() => { loadEntries(); }, []);

  const addEntry = async () => {
    if (!form.handle.trim()) return;
    const handle = form.handle.trim().replace("@", "");
    try {
      const saved = await trackCreator({ platform: "youtube", handle, name: form.label || handle, personaId: activePersonaId ?? undefined });
      setEntries(prev => [toWatchlistEntry(saved), ...prev.filter(e => e.id !== saved.id)]);
      setForm({ handle: "", label: "" });
      setShowing(false);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Couldn't add this channel.");
    }
  };

  const removeEntry = async (id: string) => {
    const prev = entries;
    setEntries(entries.filter(e => e.id !== id));
    try { await untrackCreator(id); } catch { setEntries(prev); setListError("Couldn't remove this channel. Please try again."); }
  };

  const fetchChannelVideos = async (entry: WatchlistEntry, period = filterPeriod, topN = filterTopN) => {
    setChannelStats(prev => ({ ...prev, [entry.id]: { handle: entry.handle, videos: [], loading: true } }));
    try {
      const res = await fetch(
        `/api/youtube?mode=channel&q=${encodeURIComponent(entry.handle)}&max=${topN}&period=${period}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChannelStats(prev => ({
        ...prev,
        [entry.id]: { handle: entry.handle, videos: data.videos || [], loading: false, period, topN },
      }));
    } catch (e: any) {
      setChannelStats(prev => ({ ...prev, [entry.id]: { handle: entry.handle, videos: [], loading: false, error: e.message } }));
    }
  };

  const sortVideos = (videos: any[], sort: string) => {
    const v = [...videos];
    if (sort === "newest") return v.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    if (sort === "oldest") return v.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    if (sort === "engagement") return v.sort((a, b) => {
      const er = (x: any) => x.views > 0 ? (x.likes + x.comments) / x.views : 0;
      return er(b) - er(a);
    });
    return v.sort((a, b) => b.views - a.views); // default: views
  };

  const runAnalysis = async () => {
    if (competitors.length < 1) return;
    setAnalyzing(true); setAnalysis(null);
    try {
      const res = await fetch("/api/competitor-analysis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: competitors }),
      });
      setAnalysis(await res.json());
    } finally { setAnalyzing(false); }
  };

  const toggleCompetitor = (handle: string) =>
    setCompetitors(prev => prev.includes(handle) ? prev.filter(c => c !== handle) : [...prev, handle]);

  const fetchTranscript = async (v: any) => {
    if (transcriptLoading) return;
    if (expandedTranscript === v.id) { setExpandedTranscript(null); return; }
    if (transcriptData[v.id]) { setExpandedTranscript(v.id); return; }
    setTranscriptLoading(v.id);
    try {
      const res = await fetch("/api/transcript", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v.url, title: v.title }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranscriptData(prev => ({ ...prev, [v.id]: data }));
      setExpandedTranscript(v.id);
    } catch (e: any) {
      alert("Analysis failed: " + e.message);
    } finally {
      setTranscriptLoading(null);
    }
  };

  const downloadCSV = (entryId: string, videos: any[]) => {
    const stats = channelStats[entryId];
    if (!videos.length) return;
    const escape = (s: string) => `"${String(s || "").replace(/"/g, '""')}"`;
    const header = ["rank","title","url","views","likes","comments","date","duration","hook_type","format","why_viral","hook","cta","key_topics","transcript"];
    const rows = videos.map((v: any, i: number) => {
      const td = transcriptData[v.id];
      return [
        i + 1, v.title, v.url, v.views, v.likes, v.comments,
        v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "",
        v.duration,
        td?.analysis.hookType || "", td?.analysis.format || "",
        td?.analysis.whyViral || "", td?.analysis.hook || "",
        td?.analysis.cta || "",
        td?.analysis.keyTopics?.join("; ") || "",
        td?.transcript || "",
      ].map(c => escape(String(c)));
    });
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${stats?.handle || "channel"}_top_shorts.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      {/* Header + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">Track competitor YouTube channels and analyse their top Shorts</p>
        <div className="flex gap-2">
          {competitors.length > 0 && (
            <Button onClick={runAnalysis} disabled={analyzing} className="rounded-xl gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 border-0 text-sm">
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart2 className="h-3.5 w-3.5" />}
              Analyse {competitors.length} Competitor{competitors.length > 1 ? "s" : ""}
            </Button>
          )}
          <Button onClick={() => setShowing(true)} className="rounded-xl gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 border-0 text-sm">
            <Plus className="h-4 w-4" /> Add Channel
          </Button>
        </div>
      </div>

      {/* Global filters */}
      <div className="glass rounded-2xl border border-white/[0.08] px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium">Load filters:</span>
        {/* Top N */}
        <div className="flex gap-1">
          {([10, 20, 50] as const).map(n => (
            <button key={n} onClick={() => setFilterTopN(n)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${filterTopN === n ? "bg-red-500/80 text-white" : "glass border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>
              Top {n}
            </button>
          ))}
        </div>
        {/* Period */}
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
          className="glass rounded-xl border border-white/[0.08] px-3 py-1 text-xs bg-transparent text-foreground">
          <option value="all">All Time</option>
          <option value="14d">Last 14 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="6mo">Last 6 Months</option>
          <option value="1y">Last Year</option>
        </select>
        {/* Sort */}
        <select value={filterSort} onChange={e => setFilterSort(e.target.value)}
          className="glass rounded-xl border border-white/[0.08] px-3 py-1 text-xs bg-transparent text-foreground">
          <option value="views">Most Views</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="engagement">Engagement Rate</option>
        </select>
      </div>

      {showing && (
        <div className="glass rounded-2xl p-5 border border-blue-500/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Add YouTube Channel</h3>
            <button onClick={() => setShowing(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Channel Handle / @username</label>
              <Input value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })}
                placeholder="@channelname" className="rounded-xl glass border-white/[0.08] h-10 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Label (optional)</label>
              <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Competitor A" className="rounded-xl glass border-white/[0.08] h-10 text-sm" />
            </div>
          </div>
          <Button onClick={addEntry} disabled={!form.handle.trim()} className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 border-0 text-sm gap-2">
            <Plus className="h-3.5 w-3.5" /> Add Channel
          </Button>
        </div>
      )}

      {analysis && (
        <div className="glass rounded-2xl p-6 border border-purple-500/20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base">Competitor Analysis</h2>
              <p className="text-xs text-muted-foreground">Pattern detection across {competitors.length} channels</p>
            </div>
            <button onClick={() => setAnalysis(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05] space-y-2">
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Top Content Formats</p>
              {analysis.analysis?.topFormats?.map((f: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground mt-0.5">#{i + 1}</span>
                  <div><p className="text-sm font-medium">{f.format}</p><p className="text-[11px] text-muted-foreground">{f.example}</p></div>
                </div>
              ))}
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05] space-y-2">
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Content Gaps</p>
              {analysis.analysis?.contentGaps?.map((gap: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5"><span className="text-green-400">→</span><p className="text-sm">{gap}</p></div>
              ))}
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05] space-y-2">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Hook Patterns</p>
              {analysis.analysis?.hookPatterns?.map((h: string, i: number) => <p key={i} className="text-sm">• {h}</p>)}
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">🎯 Top Recommendation</p>
              <p className="text-sm leading-relaxed">{analysis.analysis?.recommendation}</p>
            </div>
          </div>
        </div>
      )}

      {listError && (
        <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-rose-600 dark:text-rose-300">{listError}</span>
          <Button variant="ghost" size="sm" onClick={loadEntries} className="rounded-xl text-xs h-8 gap-1.5">
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="glass rounded-2xl p-8 sm:p-16 text-center">
          <Youtube className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
          <h3 className="font-semibold text-lg">No channels yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Add competitor channels to track their top Shorts</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Or <Link href="/discover" className="underline">discover creators in your niche</Link> and click Track.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Select channels for competitor analysis:</p>
          {entries.map(entry => {
            const stats = channelStats[entry.id];
            const isSelected = competitors.includes(entry.handle);
            // Sort client-side so user can change sort without re-fetching
            const displayPeriod = (stats as any)?.period ?? filterPeriod;
            const sortedVideos = stats?.videos ? sortVideos(stats.videos, filterSort) : [];
            const dataLabel = `Top ${sortedVideos.length} Shorts • ${PERIOD_LABELS[displayPeriod] ?? displayPeriod} • ${SORT_LABELS[filterSort]}`;
            return (
              <div key={entry.id} className={`glass rounded-2xl overflow-hidden transition-all duration-300 ${isSelected ? "border-purple-500/30" : ""}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => toggleCompetitor(entry.handle)}
                      className={`h-5 w-5 rounded-md border-2 shrink-0 transition-all ${isSelected ? "bg-purple-500 border-purple-500" : "border-white/[0.2]"}`}
                    />
                    {entry.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.thumbnail} alt="" className="h-10 w-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center shrink-0">
                        <Youtube className="h-5 w-5 text-red-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{entry.handle.startsWith("UC") ? entry.label : `@${entry.handle}`}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[
                          !entry.handle.startsWith("UC") && entry.label !== entry.handle ? entry.label : null,
                          entry.followers ? `${formatCount(entry.followers)} subs · ${tierLabel(entry.tier)}` : null,
                          entry.personaId && personaNames[entry.personaId] ? `for ${personaNames[entry.personaId]}` : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="ghost" size="sm"
                      onClick={() => fetchChannelVideos(entry)}
                      disabled={stats?.loading}
                      className="rounded-xl glass border-white/[0.06] text-xs h-8 gap-1.5">
                      {stats?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {stats?.videos?.length ? "Refresh" : "Load Top Shorts"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeEntry(entry.id)} className="rounded-xl h-8 w-8 p-0 text-muted-foreground hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {sortedVideos.length > 0 && (
                  <div className="border-t border-white/[0.06]">
                    {/* Data label + CSV */}
                    <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.04]">
                      <p className="text-[10px] text-muted-foreground font-medium">{dataLabel}</p>
                      <Button variant="ghost" size="sm" onClick={() => downloadCSV(entry.id, sortedVideos)}
                        className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-2">
                        <Download className="h-2.5 w-2.5" /> Download CSV
                      </Button>
                    </div>

                    {sortedVideos.map((v: any, i: number) => (
                      <div key={v.id}>
                        <div className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.04] last:border-0">
                          <span className={`text-sm font-black w-6 shrink-0 ${i < 3 ? "text-orange-400" : "text-muted-foreground/30"}`}>#{i + 1}</span>
                          {/* Thumbnail — click to open modal */}
                          <button onClick={() => setModalVideo(v)}
                            className="h-14 w-24 rounded-lg overflow-hidden bg-white/[0.02] shrink-0 relative group/thumb">
                            {v.thumbnail
                              ? <img src={v.thumbnail} alt={v.title} className="h-full w-full object-cover" />
                              : <div className="h-full w-full bg-white/[0.02]" />
                            }
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                              <Play className="h-5 w-5 text-white fill-white" />
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            <button onClick={() => setModalVideo(v)} className="text-xs font-medium hover:text-red-400 transition-colors line-clamp-1 text-left w-full">
                              {v.title}
                            </button>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{v.duration}</span>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground">{v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}</span>
                              {v.likes > 0 && <span className="text-[10px] text-muted-foreground">· 👍 {fmt(v.likes)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <Play className="h-3 w-3 text-red-400 fill-red-400" />
                              <span className="text-sm font-bold">{fmt(v.views)}</span>
                            </div>
                            <a href={v.url} target="_blank" rel="noopener noreferrer"
                              className="h-7 w-7 rounded-lg glass border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <Button variant="ghost" size="sm"
                              onClick={() => fetchTranscript(v)}
                              disabled={transcriptLoading === v.id}
                              className={`h-7 rounded-lg text-[10px] gap-1 px-2.5 border transition-colors ${expandedTranscript === v.id ? "bg-purple-500/20 border-purple-500/30 text-purple-300" : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>
                              {transcriptLoading === v.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <BookOpen className="h-3 w-3" />}
                              {transcriptLoading === v.id ? "…" : expandedTranscript === v.id ? "Close" : "Analyze"}
                            </Button>
                          </div>
                        </div>
                        {expandedTranscript === v.id && transcriptData[v.id] && (
                          <AnalysisPanel data={transcriptData[v.id]} onDownload={() => downloadCSV(entry.id, sortedVideos)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {stats?.error && <div className="border-t border-white/[0.06] px-5 py-3"><p className="text-xs text-red-400">Error: {stats.error}</p></div>}
              </div>
            );
          })}
        </div>
      )}

      {modalVideo && <VideoModal video={modalVideo} onClose={() => setModalVideo(null)} />}
    </div>
  );
}

// ── Instagram Competitors tab ─────────────────────────────────────────
// Instagram creators tracked from Discover / Keyword Research (persisted store).
function TrackedInstagramList() {
  const [items, setItems] = useState<TrackedCreator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { names } = usePersonas();

  const load = () =>
    migrateLegacyWatchlist()
      .then(() => listTracked("instagram"))
      .then((list) => { setItems(list); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load tracked creators."));
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const prev = items;
    setItems((items ?? []).filter((c) => c.id !== id));
    try { await untrackCreator(id); } catch { setItems(prev); setError("Couldn't remove this creator. Please try again."); }
  };

  if (error) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-rose-600 dark:text-rose-300">{error}</span>
        <Button variant="ghost" size="sm" onClick={load} className="rounded-xl text-xs h-8 gap-1.5"><RefreshCw className="h-3 w-3" /> Retry</Button>
      </div>
    );
  }
  if (!items || items.length === 0) return null;

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tracked creators ({items.length})</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            {c.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/proxy-image?url=${encodeURIComponent(c.thumbnail)}`} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-pink-500/15 flex items-center justify-center"><Instagram className="h-4 w-4 text-pink-500" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">@{c.handle}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {c.followers ? `${formatCount(c.followers)} followers · ${tierLabel(c.tier)}` : c.name}
                {c.personaId && names[c.personaId] && ` · for ${names[c.personaId]}`}
              </p>
            </div>
            <a href={c.url || `https://www.instagram.com/${c.handle}/reels/`} target="_blank" rel="noreferrer"
              className="text-muted-foreground hover:text-foreground" title="Open reels"><ExternalLink className="h-3.5 w-3.5" /></a>
            <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-300" title="Stop tracking">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstagramTab() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [form, setForm] = useState({ username: "", category: "" });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Top reels state (mirrors YouTube channelStats pattern)
  const [profileReels, setProfileReels] = useState<Record<string, { reels: any[]; loading: boolean; error?: string }>>({});
  const [igAnalysis, setIgAnalysis] = useState<Record<string, TranscriptData>>({});
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null);

  const load = () => fetch("/api/creators").then(r => r.json()).then(setCreators);
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ username: "", category: "" }); setDialogOpen(true); };
  const openEdit = (c: Creator) => { setEditing(c); setForm({ username: c.username, category: c.category }); setDialogOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await fetch("/api/creators", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...form }) });
      } else {
        await fetch("/api/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      }
      setDialogOpen(false); load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this creator?")) return;
    await fetch(`/api/creators?id=${id}`, { method: "DELETE" }); load();
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/creators/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [] }) });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "progress" && data.status === "scraping") {
                const c = creators.find(cr => cr.username === data.username);
                if (c) setRefreshingId(c.id);
              } else if (data.type === "progress" && data.status === "done") load();
              else if (data.type === "complete") setRefreshingId(null);
            } catch { /* skip */ }
          }
        }
      }
    } finally { setRefreshing(false); setRefreshingId(null); load(); }
  };

  const handleRefreshOne = async (id: string) => {
    setRefreshingId(id);
    try {
      const response = await fetch("/api/creators/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      load();
    } finally { setRefreshingId(null); }
  };

  const fetchTopReels = async (creator: Creator) => {
    setProfileReels(prev => ({ ...prev, [creator.id]: { reels: [], loading: true } }));
    try {
      const res = await fetch(`/api/ig-profile?username=${encodeURIComponent(creator.username)}&limit=20`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProfileReels(prev => ({ ...prev, [creator.id]: { reels: data.reels || [], loading: false } }));
    } catch (e: any) {
      setProfileReels(prev => ({ ...prev, [creator.id]: { reels: [], loading: false, error: e.message } }));
    }
  };

  const analyzeReel = async (reel: any, creatorUsername: string) => {
    const key = reel.url;
    if (analysisLoading) return;
    if (expandedAnalysis === key) { setExpandedAnalysis(null); return; }
    if (igAnalysis[key]) { setExpandedAnalysis(key); return; }
    setAnalysisLoading(key);
    try {
      const res = await fetch("/api/ig-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: reel.url,
          caption: reel.caption,
          plays: reel.views,
          likes: reel.likes,
          comments: reel.comments,
          username: creatorUsername,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIgAnalysis(prev => ({ ...prev, [key]: data }));
      setExpandedAnalysis(key);
    } catch (e: any) {
      alert("Analysis failed: " + e.message);
    } finally {
      setAnalysisLoading(null);
    }
  };

  const downloadIgCSV = (creator: Creator, reels: any[]) => {
    if (!reels.length) return;
    const escape = (s: string) => `"${String(s || "").replace(/"/g, '""')}"`;
    const header = ["rank", "url", "views", "likes", "comments", "date", "caption", "hook_type", "format", "why_viral", "hook", "cta", "key_topics"];
    const rows = reels.map((r: any, i: number) => {
      const a = igAnalysis[r.url];
      return [
        i + 1, r.url, r.views, r.likes, r.comments,
        r.timestamp ? new Date(r.timestamp).toLocaleDateString() : "",
        r.caption?.slice(0, 200),
        a?.analysis.hookType || "", a?.analysis.format || "",
        a?.analysis.whyViral || "", a?.analysis.hook || "",
        a?.analysis.cta || "", a?.analysis.keyTopics?.join("; ") || "",
      ].map(c => escape(String(c)));
    });
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${creator.username}_top_reels.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <TrackedInstagramList />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">Track Instagram competitor accounts and load their top Reels by views</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleRefreshAll} disabled={refreshing} className="rounded-xl glass border-white/[0.08] gap-1.5 text-xs">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh Stats
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 border-0 gap-1.5 text-sm">
                <Plus className="h-4 w-4" /> Add Creator
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-strong rounded-2xl border-white/[0.08]">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Creator" : "Add IG Creator"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Instagram Username</Label>
                  <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="e.g. drtanveer" className="mt-1.5 rounded-xl glass border-white/[0.08] h-11" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g. health-wellness" className="mt-1.5 rounded-xl glass border-white/[0.08] h-11" />
                </div>
                <Button onClick={handleSave} disabled={saving || !form.username || !form.category}
                  className="w-full rounded-xl h-11 bg-gradient-to-r from-pink-500 to-purple-600 border-0">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {editing ? "Saving…" : "Adding…"}</> : editing ? "Save Changes" : "Add Creator"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Creator list — full-width accordion like YouTube tab */}
      {creators.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Instagram className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="font-semibold">No Instagram competitors yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add one to start tracking.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Creators found in Keyword Research can be added via the + Add to Watchlist button</p>
        </div>
      ) : (
        <div className="space-y-4">
          {creators.map(creator => {
            const reelState = profileReels[creator.id];
            const isRefreshing = refreshingId === creator.id;
            return (
              <div key={creator.id} className="glass rounded-2xl overflow-hidden">
                {/* Creator header row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Profile pic */}
                    <div className="h-11 w-11 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-white/[0.1]">
                      {creator.profilePicUrl
                        ? <img src={`/api/proxy-image?url=${encodeURIComponent(creator.profilePicUrl)}`} alt={`@${creator.username}`} className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center text-base font-bold text-muted-foreground/50">{creator.username.charAt(0).toUpperCase()}</div>
                      }
                    </div>
                    {/* Name + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`https://www.instagram.com/${creator.username}/`} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-semibold hover:text-pink-400 transition-colors">
                          @{creator.username}
                        </a>
                        <Badge variant="secondary" className="rounded-md text-[10px] bg-white/[0.05] border border-white/[0.06]">{creator.category}</Badge>
                      </div>
                      {creator.followers > 0 && (
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <UserCheck className="h-3 w-3 text-blue-400" /> {fmt(creator.followers)}
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Film className="h-3 w-3 text-purple-400" /> {creator.reelsCount30d} reels/30d
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3 w-3 text-emerald-400" /> {fmt(creator.avgViews30d)} avg
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="ghost" size="sm"
                      onClick={() => fetchTopReels(creator)}
                      disabled={reelState?.loading}
                      className="rounded-xl glass border-white/[0.06] text-xs h-8 gap-1.5">
                      {reelState?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}
                      {reelState?.reels?.length ? "Refresh" : "Load Top Reels"}
                    </Button>
                    {reelState?.reels?.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => downloadIgCSV(creator, reelState.reels)}
                        className="rounded-xl h-8 px-2 text-[10px] glass border-white/[0.06] text-muted-foreground gap-1">
                        <Download className="h-2.5 w-2.5" /> CSV
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleRefreshOne(creator.id)} disabled={isRefreshing}
                      className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground">
                      {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(creator)}
                      className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(creator.id)}
                      className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Ranked reels list */}
                {reelState?.reels?.length > 0 && (
                  <div className="border-t border-white/[0.06]">
                    <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.04]">
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Top {reelState.reels.length} Reels • Sorted by Views
                      </p>
                    </div>

                    {reelState.reels.map((reel: any, i: number) => (
                      <div key={reel.url || i}>
                        <div className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.04] last:border-0">
                          <span className={`text-sm font-black w-6 shrink-0 ${i < 3 ? "text-pink-400" : "text-muted-foreground/30"}`}>#{i + 1}</span>
                          {/* Thumbnail — 9:16 portrait ratio */}
                          <div className="h-14 w-10 rounded-lg overflow-hidden bg-white/[0.02] shrink-0">
                            {reel.thumbnail
                              ? <img
                                  src={`/api/proxy-image?url=${encodeURIComponent(reel.thumbnail)}`}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              : <div className="h-full w-full bg-white/[0.03]" />
                            }
                          </div>
                          {/* Caption + metadata */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium line-clamp-1 leading-snug">
                              {reel.caption?.slice(0, 120) || "(no caption)"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {reel.timestamp && (
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(reel.timestamp).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                </span>
                              )}
                              {reel.likes > 0 && <span className="text-[10px] text-muted-foreground">· 👍 {fmt(reel.likes)}</span>}
                              {reel.comments > 0 && <span className="text-[10px] text-muted-foreground">💬 {fmt(reel.comments)}</span>}
                            </div>
                          </div>
                          {/* Views + actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <Play className="h-3 w-3 text-pink-400 fill-pink-400" />
                              <span className="text-sm font-bold">{fmt(reel.views)}</span>
                            </div>
                            <a href={reel.url} target="_blank" rel="noopener noreferrer"
                              className="h-7 w-7 rounded-lg glass border border-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <Button variant="ghost" size="sm"
                              onClick={() => analyzeReel(reel, creator.username)}
                              disabled={analysisLoading === reel.url}
                              className={`h-7 rounded-lg text-[10px] gap-1 px-2.5 border transition-colors ${expandedAnalysis === reel.url ? "bg-pink-500/20 border-pink-500/30 text-pink-300" : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>
                              {analysisLoading === reel.url
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <BookOpen className="h-3 w-3" />}
                              {analysisLoading === reel.url ? "…" : expandedAnalysis === reel.url ? "Close" : "Analyze"}
                            </Button>
                          </div>
                        </div>
                        {expandedAnalysis === reel.url && igAnalysis[reel.url] && (
                          <AnalysisPanel data={igAnalysis[reel.url]} onDownload={() => downloadIgCSV(creator, reelState.reels)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {reelState?.error && (
                  <div className="border-t border-white/[0.06] px-5 py-3">
                    <p className="text-xs text-red-400">Error: {reelState.error}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function WatchlistPage() {
  const [tab, setTab] = useState<"youtube" | "instagram">("youtube");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500">
            <Eye className="h-5 w-5 text-white" />
          </span>
          Competitors &amp; Watchlist
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">Track competitor channels and creators across platforms</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 glass rounded-2xl border border-white/[0.08] p-1 w-full sm:w-fit">
        <button
          onClick={() => setTab("youtube")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === "youtube" ? "bg-red-500/80 text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Youtube className="h-4 w-4" /> YouTube Channels
        </button>
        <button
          onClick={() => setTab("instagram")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === "instagram" ? "bg-pink-500/80 text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Instagram className="h-4 w-4" /> IG Competitors
        </button>
      </div>

      {tab === "youtube" ? <YoutubeTab /> : <InstagramTab />}
    </div>
  );
}
