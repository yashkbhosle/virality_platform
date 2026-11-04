"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search, Users, Play, Youtube, Loader2, BarChart2, BookOpen,
  Download, Instagram, Heart, X, CheckCircle, ExternalLink,
  AlertTriangle, TrendingUp, Flame, EyeOff, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VERDICT_LABEL, type ViralityMetrics, type ViralityVerdict } from "@/lib/virality";
import { AnalysisPanel, type TranscriptData } from "@/components/analysis-panel";
import { trackCreator } from "@/lib/tracked-creators-client";
import { useActivePersonaId } from "@/lib/active-persona";
import { saveLastSearch, saveRecentAnalysis } from "@/lib/recent-analyses";

// ── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}
function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins < 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
function ytEmbedId(url: string): string | null {
  const m = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Types ─────────────────────────────────────────────────────────────
interface Video {
  id: string; title: string; channelTitle: string; channelId: string;
  thumbnail: string; views: number; likes: number; comments: number;
  publishedAt: string; duration: string; url: string;
  channelSubscribers?: number; channelAvgViews?: number;
  metrics?: ViralityMetrics;
}
interface Channel {
  id: string; title: string; thumbnail: string; subscribers: number;
  videoCount: number; viewCount: number; description: string; url: string;
  likelyAdDriven?: boolean; avgViewsPerVideo?: number;
}
interface IGReel {
  id: string; url: string; thumbnail: string; caption: string;
  ownerUsername: string; ownerProfilePic: string;
  plays: number; likes: number; comments: number; timestamp: string;
  metrics?: ViralityMetrics | null;
}
type SortKey = "virality" | "engagement" | "outlier" | "views";

// ── Ranking helpers ───────────────────────────────────────────────────
function sortValue(m: ViralityMetrics | null | undefined, views: number, key: SortKey): number {
  if (key === "views") return views;
  if (!m) return -1; // unknown metrics sink to the bottom
  if (key === "engagement") return m.engagementRate;
  if (key === "outlier") return m.outlierScore ?? -1;
  return m.viralityScore;
}
function rankItems<T>(items: T[], get: (t: T) => { m: ViralityMetrics | null | undefined; views: number }, key: SortKey, hideAds: boolean) {
  const visible = hideAds ? items.filter(t => !get(t).m?.likelyPaid) : items;
  const hidden = items.length - visible.length;
  const sorted = [...visible].sort((a, b) => {
    const A = get(a), B = get(b);
    return sortValue(B.m, B.views, key) - sortValue(A.m, A.views, key) || B.views - A.views;
  });
  return { sorted, hidden };
}

// ── Metric badges ─────────────────────────────────────────────────────
const VERDICT_STYLE: Record<ViralityVerdict, string> = {
  "organic-viral": "bg-green-500/15 text-green-400 border-green-500/30",
  strong: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  average: "bg-white/[0.05] text-muted-foreground border-white/[0.1]",
  "likely-paid": "bg-red-500/15 text-red-400 border-red-500/30",
};
function engagementColor(rate: number) {
  if (rate >= 4) return "text-green-400";
  if (rate >= 1.5) return "text-blue-400";
  if (rate >= 0.3) return "text-yellow-400";
  return "text-red-400";
}
function MetricBadges({ m }: { m?: ViralityMetrics | null }) {
  if (!m) return <span className="text-[10px] text-muted-foreground/60">Engagement unknown (no view count)</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${VERDICT_STYLE[m.verdict]}`}
        title={m.paidReason || `Virality score ${m.viralityScore}/100`}>
        {m.verdict === "likely-paid" ? <AlertTriangle className="h-2.5 w-2.5" /> : <Flame className="h-2.5 w-2.5" />}
        {VERDICT_LABEL[m.verdict]} · {m.viralityScore}
      </span>
      <span className={`text-[10px] font-semibold ${engagementColor(m.engagementRate)}`} title="(likes + comments) ÷ views">
        {m.engagementRate}% engagement
      </span>
      {m.outlierScore !== null && (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${m.outlierScore >= 5 ? "text-orange-400" : "text-muted-foreground"}`}
          title="Views ÷ the channel's average views per video">
          <TrendingUp className="h-2.5 w-2.5" /> {m.outlierScore}× channel avg
        </span>
      )}
    </div>
  );
}
// ── In-app video modal ────────────────────────────────────────────────
function VideoModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const embedId = ytEmbedId(video.url);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl glass rounded-3xl overflow-hidden border border-white/[0.1]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full glass flex items-center justify-center hover:bg-white/[0.1] transition-colors">
          <X className="h-4 w-4" />
        </button>
        {/* 9:16 aspect ratio container for Short */}
        <div className="relative mx-auto" style={{ maxWidth: 360 }}>
          <div className="aspect-[9/16]">
            {embedId ? (
              <iframe
                src={`https://www.youtube.com/embed/${embedId}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/30">
                <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-400 hover:underline">
                  <ExternalLink className="h-4 w-4" /> Open on YouTube
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 space-y-1">
          <p className="text-sm font-semibold line-clamp-2">{video.title}</p>
          <p className="text-xs text-muted-foreground">{video.channelTitle} · {timeAgo(video.publishedAt)}</p>
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5 text-red-400 fill-red-400" /><span className="text-sm font-bold">{fmt(video.views)}</span></span>
            <span className="text-xs text-muted-foreground">👍 {fmt(video.likes)}</span>
            <span className="text-xs text-muted-foreground">💬 {fmt(video.comments)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────
function SectionHeader({ icon, title, accent, count, loading, label }: {
  icon: React.ReactNode; title: string; accent: string;
  count: number; loading: boolean; label: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${accent}`}>{icon}</div>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
        : count > 0 && <span className="ml-auto text-xs text-muted-foreground bg-white/[0.05] px-2.5 py-0.5 rounded-full">{count} results</span>
      }
    </div>
  );
}

// ── Add-to-watchlist mini toast ───────────────────────────────────────
// Watchlist entries are stored server-side via /api/tracked-creators.
function useWatchlist() {
  const [activePersonaId] = useActivePersonaId();
  const add = async (handle: string, label: string, platform: "youtube" | "instagram") => {
    try {
      await trackCreator({ platform, handle, name: label, personaId: activePersonaId ?? undefined });
      return true;
    } catch { return false; }
  };
  return { add };
}

// ── Main page ─────────────────────────────────────────────────────────
export default function KeywordResearchPage() {
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState<"both" | "youtube" | "instagram">("both");
  // Default to recent content — older "all time" hits reflect old trends
  const [period, setPeriod] = useState("6mo");
  const [sortBy, setSortBy] = useState<SortKey>("virality");
  const [hideAds, setHideAds] = useState(true);
  const [ytMax, setYtMax] = useState(20);
  const [loading, setLoading] = useState(false);
  const [igLoading, setIgLoading] = useState(false);
  const [igError, setIgError] = useState<string | null>(null);
  const [igMessage, setIgMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [igReels, setIgReels] = useState<IGReel[]>([]);

  // Video modal
  const [modalVideo, setModalVideo] = useState<Video | null>(null);

  // YouTube analysis
  const [transcriptLoading, setTranscriptLoading] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<Record<string, TranscriptData>>({});
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);

  // Instagram analysis
  const [igAnalysisLoading, setIgAnalysisLoading] = useState<string | null>(null);
  const [igAnalysisData, setIgAnalysisData] = useState<Record<string, TranscriptData>>({});
  const [igExpanded, setIgExpanded] = useState<string | null>(null);

  // Watchlist
  const { add: addToWatchlist } = useWatchlist();
  const [wlAdded, setWlAdded] = useState<Set<string>>(new Set());

  const handleAddWatchlist = async (handle: string, label: string, pl: "youtube" | "instagram") => {
    const added = await addToWatchlist(handle, label, pl);
    if (added) setWlAdded(prev => new Set(prev).add(`${pl}:${handle}`));
  };

  // Deep link from Discover Creators: /keyword-research?channel=<channelId>&name=<title>
  // loads that channel's top Shorts into the results.
  const [channelView, setChannelView] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channel = params.get("channel");
    if (!channel) return;
    const name = params.get("name") || channel;
    setChannelView(name);
    setKeyword(name);
    setPlatform("youtube");
    setSearched(true);
    setLoading(true);
    setIgLoading(false);
    fetch(`/api/youtube?mode=channel&q=${encodeURIComponent(channel)}&max=50&period=all`)
      .then(r => r.json())
      .then(d => setVideos(d.videos || []))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, []);

  // Derive top IG creators
  const igCreators = useMemo(() => {
    const map: Record<string, { username: string; profilePic: string; reelCount: number; totalLikes: number; totalPlays: number }> = {};
    igReels.forEach(r => {
      if (!r.ownerUsername) return;
      if (!map[r.ownerUsername]) map[r.ownerUsername] = { username: r.ownerUsername, profilePic: r.ownerProfilePic, reelCount: 0, totalLikes: 0, totalPlays: 0 };
      map[r.ownerUsername].reelCount++;
      map[r.ownerUsername].totalLikes += r.likes;
      map[r.ownerUsername].totalPlays += r.plays;
    });
    return Object.values(map).sort((a, b) => (b.totalPlays || b.totalLikes) - (a.totalPlays || a.totalLikes)).slice(0, 8);
  }, [igReels]);

  const ytRanked = useMemo(
    () => rankItems(videos, v => ({ m: v.metrics, views: v.views }), sortBy, hideAds),
    [videos, sortBy, hideAds]
  );
  const shownVideos = ytRanked.sorted.slice(0, ytMax);
  const igRanked = useMemo(
    () => rankItems(igReels, r => ({ m: r.metrics, views: r.plays }), sortBy === "outlier" ? "engagement" : sortBy, hideAds),
    [igReels, sortBy, hideAds]
  );
  const shownReels = igRanked.sorted.slice(0, 20);

  const search = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setIgLoading(true);
    setSearched(true);
    setVideos([]); setChannels([]); setIgReels([]); setIgError(null); setIgMessage(null);
    const p = `&period=${period}`;

    const fetchYT = platform === "both" || platform === "youtube";
    const fetchIG = platform === "both" || platform === "instagram";

    if (fetchYT) {
      const ytDone = Promise.all([
        fetch(`/api/youtube?mode=keyword&q=${encodeURIComponent(keyword)}&max=${ytMax}${p}`)
          .then(r => r.json()).then(d => setVideos(d.videos || [])).catch(() => {}),
        fetch(`/api/youtube?mode=channels&q=${encodeURIComponent(keyword)}&max=10`)
          .then(r => r.json()).then(d => setChannels(d.channels || [])).catch(() => {}),
      ]).finally(() => setLoading(false));
      await ytDone;
    } else {
      setLoading(false);
    }

    if (fetchIG) {
      fetch(`/api/instagram?q=${encodeURIComponent(keyword)}&max=20${p}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) { setIgError(d.error); return; }
          if (d.message) setIgMessage(d.message);
          if (d.videos) setIgReels(d.videos.map((v: any) => ({
            id: v.url || "",
            url: v.url || "",
            thumbnail: v.thumbnail || "",
            caption: v.caption || "",
            ownerUsername: v.creator || "",
            ownerProfilePic: "",
            plays: v.views || 0,
            likes: v.likes || 0,
            comments: v.comments || 0,
            timestamp: v.timestamp || "",
            metrics: v.metrics ?? null,
          })));
        })
        .catch(e => setIgError(String(e)))
        .finally(() => setIgLoading(false));
    } else {
      setIgLoading(false);
    }
  };

  // Remember the top organic outliers so the Script Writer can draw hooks from them.
  useEffect(() => {
    if (!videos.length && !igReels.length) return;
    saveLastSearch(keyword, [
      ...videos.map(v => ({ title: v.title, creator: v.channelTitle, views: v.views, url: v.url, score: v.metrics?.viralityScore ?? 0, paid: !!v.metrics?.likelyPaid })),
      ...igReels.map(r => ({ title: r.caption.slice(0, 120), creator: "@" + r.ownerUsername, views: r.plays, url: r.url, score: r.metrics?.viralityScore ?? 0, paid: !!r.metrics?.likelyPaid })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when results change, not on every keystroke
  }, [videos, igReels]);

  const fetchTranscript = async (video: Video, fresh = false) => {
    if (!fresh && transcriptData[video.id]) {
      setExpandedTranscript(expandedTranscript === video.id ? null : video.id);
      return;
    }
    setTranscriptLoading(video.id);
    try {
      const res = await fetch("/api/transcript", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: video.url, title: video.title, channelTitle: video.channelTitle,
          views: video.views, likes: video.likes, comments: video.comments, metrics: video.metrics ?? null, fresh,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error);
      setTranscriptData(prev => ({ ...prev, [video.id]: data }));
      saveRecentAnalysis({ url: video.url, title: video.title, creator: video.channelTitle, views: video.views, platform: "youtube", analysis: data.analysis });
      setExpandedTranscript(video.id);
    } catch (e: unknown) { alert((e instanceof Error && e.message) || "Couldn't analyze this video right now. Please try again."); }
    finally { setTranscriptLoading(null); }
  };

  const fetchIgAnalysis = async (reel: IGReel, fresh = false) => {
    if (!fresh && igAnalysisData[reel.id]) {
      setIgExpanded(igExpanded === reel.id ? null : reel.id);
      return;
    }
    setIgAnalysisLoading(reel.id);
    try {
      const res = await fetch("/api/ig-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: reel.url, caption: reel.caption, plays: reel.plays, likes: reel.likes, comments: reel.comments, username: reel.ownerUsername, metrics: reel.metrics ?? null, fresh }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error);
      setIgAnalysisData(prev => ({ ...prev, [reel.id]: data }));
      saveRecentAnalysis({ url: reel.url, title: reel.caption.slice(0, 120) || `Reel by @${reel.ownerUsername}`, creator: "@" + reel.ownerUsername, views: reel.plays, platform: "instagram", analysis: data.analysis });
      setIgExpanded(reel.id);
    } catch (e: unknown) { alert((e instanceof Error && e.message) || "Couldn't analyze this reel right now. Please try again."); }
    finally { setIgAnalysisLoading(null); }
  };

  const downloadCSV = () => {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""').replace(/\n|\r/g, " ")}"`;
    const cols = ["platform","url","title_or_caption","creator","views_or_plays","likes","comments","date",
      "engagement_rate_pct","outlier_x_channel_avg","virality_score","verdict","likely_paid","paid_reason",
      "hook_type","format","target_avatar","hook_strength","relevance","non_obvious","absorption","short_distance",
      "why_viral","hook","cta","key_topics","comment_triggers","replicate","transcript"];
    const metricCols = (m?: ViralityMetrics | null) => [
      m?.engagementRate ?? "", m?.outlierScore ?? "", m?.viralityScore ?? "", m ? VERDICT_LABEL[m.verdict] : "",
      m ? (m.likelyPaid ? "yes" : "no") : "", m?.paidReason ?? "",
    ];
    const analysisCols = (td?: TranscriptData) => {
      const a = td?.analysis;
      return [
        a?.hookType||"", a?.format||"", a?.targetAvatar||"", a?.hookStrength?.score ?? "",
        a?.engagementRules?.relevance?.score ?? "", a?.engagementRules?.nonObvious?.score ?? "",
        a?.engagementRules?.absorption?.score ?? "", a?.engagementRules?.shortDistance?.score ?? "",
        a?.whyViral||"", a?.hook||"", a?.cta||"", a?.keyTopics?.join("; ")||"",
        a?.commentTriggers?.join("; ")||"", a?.replicate?.join(" | ")||"", td?.transcript||"",
      ];
    };
    const ytRows = shownVideos.map(v => [
      "YouTube Short", v.url, v.title, v.channelTitle, v.views, v.likes, v.comments, v.publishedAt,
      ...metricCols(v.metrics), ...analysisCols(transcriptData[v.id]),
    ].map(esc).join(","));
    const igRows = shownReels.map(r => [
      "Instagram Reel", r.url, r.caption, r.ownerUsername, r.plays||"", r.likes, r.comments, r.timestamp,
      ...metricCols(r.metrics), ...analysisCols(igAnalysisData[r.id]),
    ].map(esc).join(","));
    const csv = [cols.map(c => `"${c}"`).join(","), ...ytRows, ...igRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyword-research-${keyword.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const igTag = keyword.trim().split(/\s+/)[0].toLowerCase();
  const periodLabel: Record<string, string> = { "14d": "14 days", "30d": "1 month", "6mo": "6 months", "1y": "1 year", "2y": "2 years", "all": "all time" };
  const sortLabel: Record<SortKey, string> = { virality: "Ranked by virality score", engagement: "Ranked by engagement rate", outlier: "Ranked by outlier score", views: "Ranked by most views" };
  const hasResults = videos.length > 0 || igReels.length > 0;
  const showYT = platform === "both" || platform === "youtube";
  const showIG = platform === "both" || platform === "instagram";

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-500">
              <Search className="h-5 w-5 text-white" />
            </span>
            Keyword Research
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">Find genuinely viral Shorts and Reels — ranked by engagement, with paid ads filtered out</p>
        </div>
        {hasResults && (
          <Button variant="ghost" size="sm" onClick={downloadCSV} className="rounded-xl glass border-white/[0.08] gap-1.5 text-xs h-9">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="e.g. cirrhosis treatment, IVF success, Ayurvedic diet..."
              className="pl-11 h-12 rounded-2xl glass border-white/[0.08] text-sm"
            />
          </div>
          <Button
            onClick={search}
            disabled={(loading && igLoading) || !keyword.trim()}
            className="h-12 px-6 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 border-0 gap-2 font-semibold"
          >
            {(loading || igLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {(loading || igLoading) ? "Searching…" : "Search"}
          </Button>
        </div>

        {/* Platform + Period filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Platform selector */}
          <div className="flex items-center gap-1 glass rounded-full border border-white/[0.08] p-1">
            {([["both", "Both"], ["youtube", "YouTube"], ["instagram", "Instagram"]] as const).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setPlatform(val)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  platform === val
                    ? val === "youtube" ? "bg-red-500/80 text-white"
                      : val === "instagram" ? "bg-pink-500/80 text-white"
                      : "bg-white/[0.12] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {val === "youtube" && <Youtube className="inline h-3 w-3 mr-1" />}
                {val === "instagram" && <Instagram className="inline h-3 w-3 mr-1" />}
                {lbl}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Period filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Period:</span>
            {[
              { value: "14d",  label: "14 Days"   },
              { value: "30d",  label: "1 Month"   },
              { value: "6mo",  label: "6 Months"  },
              { value: "1y",   label: "1 Year"    },
              { value: "all",  label: "All Time"  },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                  period === value
                    ? "bg-gradient-to-r from-red-500 to-orange-500 border-transparent text-white"
                    : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(platform === "both" || platform === "youtube") && (
            <>
              <div className="h-4 w-px bg-white/[0.08]" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">YT Videos:</span>
                {[20, 50, 100].map(n => (
                  <button
                    key={n}
                    onClick={() => setYtMax(n)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                      ytMax === n
                        ? "bg-gradient-to-r from-red-500 to-orange-500 border-transparent text-white"
                        : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

        </div>

        {/* Ranking + ad filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Rank by:</span>
            {([
              ["virality", "Virality score"],
              ["engagement", "Engagement rate"],
              ["outlier", "Outlier (vs channel avg)"],
              ["views", "Most views"],
            ] as const).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setSortBy(val)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                  sortBy === val
                    ? "bg-gradient-to-r from-red-500 to-orange-500 border-transparent text-white"
                    : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-white/[0.08]" />
          <button
            onClick={() => setHideAds(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
              hideAds ? "bg-green-500/15 border-green-500/30 text-green-400" : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
            title="Hide videos whose views look like paid ad impressions (very low likes per view)"
          >
            {hideAds ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {hideAds ? "Hiding likely ads" : "Showing likely ads"}
          </button>
          {searched && (
            <span className="ml-auto text-xs text-muted-foreground">
              {sortLabel[sortBy]} · {periodLabel[period]}
            </span>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {!searched && (
        <div className="glass rounded-2xl p-8 sm:p-16 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
          <h3 className="font-semibold text-lg">Search any keyword</h3>
          <p className="text-sm text-muted-foreground mt-1">Discover the most-viewed Shorts and Reels in any niche</p>
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground/60">
            <span className="flex items-center gap-1.5"><Youtube className="h-3.5 w-3.5 text-red-400" /> YouTube Shorts + Channels</span>
            <span className="flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5 text-pink-400" /> Instagram Reels + Creators</span>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {searched && (
        <div className="space-y-12">
          {channelView && (
            <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3">
              <p className="text-sm">
                Top Shorts from <span className="font-semibold">{channelView}</span>
                <span className="text-muted-foreground">, ranked by virality</span>
              </p>
              <a href="/keyword-research" className="text-xs text-muted-foreground hover:text-foreground underline">Clear</a>
            </div>
          )}

          {/* ══ YOUTUBE SECTION ══ */}
          {showYT && (
            <section>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium px-2">YouTube</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <SectionHeader
                icon={<Youtube className="h-5 w-5 text-white" />}
                accent="bg-gradient-to-br from-red-500 to-orange-500"
                title="Top YouTube Shorts"
                label={`Shorts for "${keyword}" · ${sortLabel[sortBy].toLowerCase()}${hideAds && ytRanked.hidden ? ` · ${ytRanked.hidden} likely ad${ytRanked.hidden === 1 ? "" : "s"} hidden` : ""}`}
                count={shownVideos.length}
                loading={loading}
              />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
                {/* Shorts list */}
                <div className="space-y-3">
                  {loading && videos.length === 0 && (
                    <div className="glass rounded-2xl p-10 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-red-400 mb-3" />
                      <p className="text-sm text-muted-foreground">Fetching YouTube Shorts…</p>
                    </div>
                  )}
                  {!loading && shownVideos.length === 0 && (
                    <div className="glass rounded-2xl p-10 text-center">
                      <Youtube className="mx-auto h-8 w-8 text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {videos.length > 0 ? "All results look like paid ads. Toggle \"Showing likely ads\" to see them." : "No Shorts found for this keyword."}
                      </p>
                    </div>
                  )}
                  {shownVideos.map((video, i) => (
                    <div key={video.id} className="group">
                      <div className="glass rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all duration-300">
                        <div className="flex gap-2 sm:gap-4 p-3 sm:p-4">
                          <div className="shrink-0 flex items-start pt-1">
                            <span className={`text-base sm:text-2xl font-black ${i < 3 ? "text-orange-400" : "text-muted-foreground/30"}`}>#{i + 1}</span>
                          </div>
                          {/* Thumbnail — click opens in-app modal */}
                          <button onClick={() => setModalVideo(video)} className="shrink-0 text-left">
                            <div className="relative h-[65px] w-[116px] sm:h-[90px] sm:w-[160px] rounded-xl overflow-hidden bg-white/[0.02]">
                              {video.thumbnail && <img src={video.thumbnail} alt={video.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                <Play className="h-8 w-8 text-white fill-white" />
                              </div>
                              <div className="absolute bottom-1.5 right-1.5 bg-black/80 rounded-md px-1.5 py-0.5 text-[10px] font-mono text-white">{video.duration}</div>
                              <div className="absolute top-1.5 left-1.5 bg-red-500/90 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white">SHORT</div>
                            </div>
                          </button>
                          <div className="flex-1 min-w-0 space-y-2">
                            <button onClick={() => setModalVideo(video)} className="text-left w-full">
                              <h3 className="text-sm font-semibold leading-tight hover:text-red-400 transition-colors line-clamp-2">{video.title}</h3>
                            </button>
                            <p className="text-xs text-muted-foreground">{video.channelTitle} · {timeAgo(video.publishedAt)}</p>
                            <div className="flex items-center gap-4">
                              <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5 text-red-400 fill-red-400" /><span className="text-sm font-bold">{fmt(video.views)}</span></span>
                              <span className="text-xs text-muted-foreground">👍 {fmt(video.likes)}</span>
                              <span className="text-xs text-muted-foreground">💬 {fmt(video.comments)}</span>
                            </div>
                            <MetricBadges m={video.metrics} />
                            {video.metrics?.likelyPaid && video.metrics.paidReason && (
                              <p className="text-[10px] text-red-400/80">{video.metrics.paidReason}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => fetchTranscript(video)}
                              disabled={transcriptLoading === video.id}
                              className="rounded-xl glass border-white/[0.08] gap-1.5 text-xs h-8"
                            >
                              {transcriptLoading === video.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                              {transcriptData[video.id] ? (expandedTranscript === video.id ? "Hide" : "Show") : "Analyze"}
                            </Button>
                          </div>
                        </div>
                        {expandedTranscript === video.id && transcriptData[video.id] && (
                          <AnalysisPanel
                            data={transcriptData[video.id]}
                            source={{ url: video.url, title: video.title, views: video.views }}
                            onReanalyze={() => fetchTranscript(video, true)}
                            reanalyzing={transcriptLoading === video.id}
                            onDownload={() => {
                              const blob = new Blob([transcriptData[video.id].transcript], { type: "text/plain" });
                              const u = URL.createObjectURL(blob);
                              const a = document.createElement("a"); a.href = u;
                              a.download = `${video.title.slice(0, 30)}-transcript.txt`; a.click();
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* YouTube Channels sidebar */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Top Channels
                  </p>
                  {loading && channels.length === 0 && (
                    <div className="glass rounded-2xl p-6 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-red-400 mb-2" />
                      <p className="text-xs text-muted-foreground">Finding channels…</p>
                    </div>
                  )}
                  {!loading && channels.length === 0 && <div className="glass rounded-2xl p-6 text-center"><p className="text-xs text-muted-foreground">No channels found.</p></div>}
                  {channels.map((ch, i) => {
                    const wlKey = `youtube:${ch.title}`;
                    const alreadyAdded = wlAdded.has(wlKey);
                    return (
                      <div key={ch.id} className="glass rounded-2xl p-4 hover:border-white/[0.12] transition-all duration-300">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <span className={`absolute -top-1 -left-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-black z-10 ${i < 3 ? "bg-orange-500 text-white" : "bg-white/[0.1] text-muted-foreground"}`}>{i + 1}</span>
                            {ch.thumbnail
                              ? <img src={ch.thumbnail} alt={ch.title} className="h-10 w-10 rounded-full object-cover" />
                              : <div className="h-10 w-10 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center text-base font-bold">{ch.title.charAt(0)}</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <a href={ch.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-red-400 transition-colors truncate block">{ch.title}</a>
                            <p className="text-[11px] text-muted-foreground truncate">{ch.description}</p>
                            {ch.likelyAdDriven && (
                              <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-1.5 py-0.5"
                                title="Total views are over 1000× subscribers — reach is likely bought with ads">
                                <AlertTriangle className="h-2.5 w-2.5" /> Likely ad-driven
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          {[
                            { icon: <Users className="h-2.5 w-2.5 text-blue-400" />, val: fmt(ch.subscribers), label: "Subs" },
                            { icon: <Play className="h-2.5 w-2.5 text-red-400" />, val: fmt(ch.videoCount), label: "Videos" },
                            { icon: <BarChart2 className="h-2.5 w-2.5 text-green-400" />, val: fmt(ch.avgViewsPerVideo ?? (ch.videoCount ? Math.round(ch.viewCount / ch.videoCount) : 0)), label: "Avg / video" },
                          ].map(({ icon, val, label }) => (
                            <div key={label} className="bg-black/20 border border-white/[0.04] rounded-lg p-2 text-center">
                              <div className="flex justify-center mb-0.5">{icon}</div>
                              <p className="text-[11px] font-bold">{val}</p>
                              <p className="text-[9px] text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleAddWatchlist(ch.title, ch.title, "youtube")}
                          disabled={alreadyAdded}
                          className={`mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                            alreadyAdded
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "glass border border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/[0.15]"
                          }`}
                        >
                          {alreadyAdded ? <><CheckCircle className="h-3 w-3" /> Added to Watchlist</> : <>+ Add to Watchlist</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ══ INSTAGRAM SECTION ══ */}
          {showIG && (
            <section>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest font-medium px-2">Instagram</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <SectionHeader
                icon={<Instagram className="h-5 w-5 text-white" />}
                accent="bg-gradient-to-br from-pink-500 to-purple-600"
                title="Top Instagram Reels"
                label={`Reels for #${igTag} · ${(sortBy === "outlier" ? sortLabel.engagement : sortLabel[sortBy]).toLowerCase()}${hideAds && igRanked.hidden ? ` · ${igRanked.hidden} likely ad${igRanked.hidden === 1 ? "" : "s"} hidden` : ""}`}
                count={shownReels.length}
                loading={igLoading}
              />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
                {/* Reels list */}
                <div className="space-y-3">
                  {igLoading && igReels.length === 0 && (
                    <div className="glass rounded-2xl p-10 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-pink-400 mb-3" />
                      <p className="text-sm text-muted-foreground">Searching Instagram for <span className="text-pink-400 font-medium">#{igTag}</span>…</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">This can take 30–60 seconds</p>
                    </div>
                  )}
                  {!igLoading && igError && (
                    <div className="glass rounded-2xl p-8 text-center border border-red-500/20">
                      <p className="text-sm font-semibold text-red-400 mb-1">Instagram error</p>
                      <p className="text-xs text-muted-foreground font-mono break-all">{igError}</p>
                    </div>
                  )}
                  {!igLoading && !igError && shownReels.length === 0 && (
                    <div className="glass rounded-2xl p-10 text-center">
                      <Instagram className="mx-auto h-8 w-8 text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {igMessage || <>No Reels found for <span className="text-pink-400">#{igTag}</span></>}
                      </p>
                    </div>
                  )}
                  {shownReels.map((reel, i) => (
                    <div key={reel.id} className="group">
                      <div className="glass rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all duration-300">
                        <div className="flex gap-2 sm:gap-4 p-3 sm:p-4">
                          <div className="shrink-0 flex items-start pt-1">
                            <span className={`text-base sm:text-2xl font-black ${i < 3 ? "text-pink-400" : "text-muted-foreground/30"}`}>#{i + 1}</span>
                          </div>
                          <a href={reel.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            <div className="relative h-[90px] w-[51px] rounded-xl overflow-hidden bg-white/[0.02]">
                              {reel.thumbnail
                                ? <img src={reel.thumbnail} alt={reel.caption} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                : <div className="h-full w-full flex items-center justify-center"><Instagram className="h-4 w-4 text-muted-foreground/30" /></div>
                              }
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                              <div className="absolute bottom-1 left-0 right-0 text-center">
                                <span className="text-[9px] font-bold text-white">
                                  ▶ {reel.plays > 0 ? fmt(reel.plays) : reel.likes > 0 ? `~${fmt(reel.likes * 50 + reel.comments * 200)}` : "—"}
                                </span>
                              </div>
                            </div>
                          </a>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              {reel.ownerProfilePic
                                ? <img src={reel.ownerProfilePic} alt={reel.ownerUsername} className="h-5 w-5 rounded-full object-cover shrink-0" />
                                : <div className="h-5 w-5 rounded-full bg-gradient-to-br from-pink-500/30 to-purple-500/30 shrink-0 flex items-center justify-center text-[9px] font-bold">{reel.ownerUsername?.charAt(0)?.toUpperCase()}</div>
                              }
                              <a href={`https://www.instagram.com/${reel.ownerUsername}/`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-pink-400 transition-colors">
                                @{reel.ownerUsername}
                              </a>
                              <span className="hidden sm:inline text-[10px] text-muted-foreground ml-auto shrink-0">{timeAgo(reel.timestamp)}</span>
                            </div>
                            {reel.caption && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{reel.caption}</p>}
                            <div className="flex items-center gap-4">
                              <span className="flex items-center gap-1.5">
                                <Play className="h-3.5 w-3.5 text-red-400 fill-red-400" />
                                <span className="text-sm font-bold">
                                  {reel.plays > 0
                                    ? fmt(reel.plays)
                                    : reel.likes > 0
                                      ? fmt(reel.likes * 50 + reel.comments * 200)
                                      : "—"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {reel.plays > 0 ? "views" : "est. views"}
                                </span>
                              </span>
                              <span className="text-xs text-muted-foreground">❤️ {fmt(reel.likes)}</span>
                              <span className="text-xs text-muted-foreground">💬 {fmt(reel.comments)}</span>
                            </div>
                            <MetricBadges m={reel.metrics} />
                          </div>
                          <div className="shrink-0 flex items-center">
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => fetchIgAnalysis(reel)}
                              disabled={igAnalysisLoading === reel.id}
                              className="rounded-xl glass border-white/[0.08] gap-1.5 text-xs h-8"
                            >
                              {igAnalysisLoading === reel.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                              {igAnalysisData[reel.id] ? (igExpanded === reel.id ? "Hide" : "Show") : "Analyze"}
                            </Button>
                          </div>
                        </div>
                        {igExpanded === reel.id && igAnalysisData[reel.id] && (
                          <AnalysisPanel
                            data={igAnalysisData[reel.id]}
                            source={{ url: reel.url, title: reel.caption.slice(0, 120), views: reel.plays }}
                            onReanalyze={() => fetchIgAnalysis(reel, true)}
                            reanalyzing={igAnalysisLoading === reel.id}
                            onDownload={() => {
                              const blob = new Blob([igAnalysisData[reel.id].transcript], { type: "text/plain" });
                              const u = URL.createObjectURL(blob);
                              const a = document.createElement("a"); a.href = u;
                              a.download = `${reel.ownerUsername}-transcript.txt`; a.click();
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Instagram Creators sidebar */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Top Creators
                  </p>
                  {igLoading && igCreators.length === 0 && (
                    <div className="glass rounded-2xl p-6 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-pink-400 mb-2" />
                      <p className="text-xs text-muted-foreground">Finding creators…</p>
                    </div>
                  )}
                  {!igLoading && igCreators.length === 0 && igReels.length === 0 && (
                    <div className="glass rounded-2xl p-6 text-center"><p className="text-xs text-muted-foreground">No creators found.</p></div>
                  )}
                  {igCreators.map((creator, i) => {
                    const wlKey = `instagram:${creator.username}`;
                    const alreadyAdded = wlAdded.has(wlKey);
                    return (
                      <div key={creator.username} className="glass rounded-2xl p-4 hover:border-white/[0.12] transition-all duration-300">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <span className={`absolute -top-1 -left-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-black z-10 ${i < 3 ? "bg-pink-500 text-white" : "bg-white/[0.1] text-muted-foreground"}`}>{i + 1}</span>
                            {creator.profilePic
                              ? <img src={creator.profilePic} alt={creator.username} className="h-10 w-10 rounded-full object-cover" />
                              : <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center text-base font-bold">{creator.username.charAt(0).toUpperCase()}</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <a href={`https://www.instagram.com/${creator.username}/`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-pink-400 transition-colors truncate block">@{creator.username}</a>
                            <p className="text-[11px] text-muted-foreground">{creator.reelCount} reel{creator.reelCount !== 1 ? "s" : ""} in results</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          {[
                            { icon: <Play className="h-2.5 w-2.5 text-pink-400" />, val: creator.totalPlays > 0 ? fmt(creator.totalPlays) : "—", label: "Total Views" },
                            { icon: <Heart className="h-2.5 w-2.5 text-purple-400" />, val: fmt(creator.totalLikes), label: "Total Likes" },
                          ].map(({ icon, val, label }) => (
                            <div key={label} className="bg-black/20 border border-white/[0.04] rounded-lg p-2 text-center">
                              <div className="flex justify-center mb-0.5">{icon}</div>
                              <p className="text-[11px] font-bold">{val}</p>
                              <p className="text-[9px] text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleAddWatchlist(creator.username, `@${creator.username}`, "instagram")}
                          disabled={alreadyAdded}
                          className={`mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                            alreadyAdded
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "glass border border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/[0.15]"
                          }`}
                        >
                          {alreadyAdded ? <><CheckCircle className="h-3 w-3" /> Added to Watchlist</> : <>+ Add to Watchlist</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── In-app video modal ── */}
      {modalVideo && <VideoModal video={modalVideo} onClose={() => setModalVideo(null)} />}
    </div>
  );
}
