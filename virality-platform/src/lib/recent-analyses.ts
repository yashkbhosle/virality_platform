"use client";
// Per-browser memory of what the user analyzed and searched in Keyword Research,
// so the Script Writer can start from a real video and real outliers.
import type { ViralAnalysis } from "./analysis-prompt";
import type { Outlier } from "./script-flow";

const ANALYSES_KEY = "viralos_recent_analyses";
const SEARCH_KEY = "viralos_last_search_outliers";
const MAX_ANALYSES = 20;

export interface RecentAnalysis {
  url: string;
  title: string;
  creator?: string;
  views?: number;
  platform: "youtube" | "instagram";
  analysis: ViralAnalysis;
  analyzedAt: string;
}

export interface LastSearch {
  keyword: string;
  outliers: Outlier[];
  savedAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: this is only a convenience.
  }
}

export function listRecentAnalyses(): RecentAnalysis[] {
  const list = read<RecentAnalysis[]>(ANALYSES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function getRecentAnalysis(url: string): RecentAnalysis | undefined {
  return listRecentAnalyses().find((a) => a.url === url);
}

export function saveRecentAnalysis(entry: Omit<RecentAnalysis, "analyzedAt">) {
  const rest = listRecentAnalyses().filter((a) => a.url !== entry.url);
  write(ANALYSES_KEY, [{ ...entry, analyzedAt: new Date().toISOString() }, ...rest].slice(0, MAX_ANALYSES));
}

/** Keeps the top non-paid videos (by virality score) from the latest keyword search. */
export function saveLastSearch(
  keyword: string,
  items: { title: string; creator: string; views: number; url: string; score: number; paid: boolean }[]
) {
  const outliers = items
    .filter((i) => !i.paid && i.views > 0 && i.url && i.title)
    .sort((a, b) => b.score - a.score || b.views - a.views)
    .slice(0, 6)
    .map(({ title, creator, views, url }) => ({ title: title.slice(0, 200), creator, views, url }));
  if (outliers.length) write(SEARCH_KEY, { keyword, outliers, savedAt: new Date().toISOString() });
}

export function getLastSearch(): LastSearch | null {
  return read<LastSearch | null>(SEARCH_KEY, null);
}

/** Outliers with their analyzed opening hook when we have one. */
export function outliersForScript(): { keyword: string; outliers: Outlier[] } {
  const last = getLastSearch();
  if (!last) return { keyword: "", outliers: [] };
  return {
    keyword: last.keyword,
    outliers: last.outliers.map((o) => ({ ...o, hook: getRecentAnalysis(o.url)?.analysis.hook ?? o.hook })),
  };
}
