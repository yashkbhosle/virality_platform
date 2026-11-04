// Data for the pipeline pages (Creators, Configs, Videos, Run Pipeline).
//
// These used to live in ../data/*.csv, which can't be written on Vercel (read-only
// filesystem), so adding a creator failed there. They now go through the app's
// document store like everything else (Supabase in production, ../data/*.json locally).
//
// The old CSV files are imported once per collection, the first time it is read,
// when they can be found (local runs, or `npm run migrate:pipeline`). Server-side only.

import { parse } from "csv-parse/sync";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getStore } from "./store";
import type { Config, Creator, Video } from "./types";

const COLLECTIONS = {
  creators: "pipeline_creators",
  configs: "pipeline_configs",
  videos: "pipeline_videos",
} as const;
type Kind = keyof typeof COLLECTIONS;
const META = "pipeline_meta";
const CSV_DIR = path.join(process.cwd(), "..", "data");
const CSV_FILES: Record<Kind, string> = { creators: "creators.csv", configs: "configs.csv", videos: "videos.csv" };

function readCsv(filename: string): Record<string, string>[] {
  try {
    const filepath = path.join(CSV_DIR, filename);
    if (!existsSync(filepath)) return [];
    const content = readFileSync(filepath, "utf-8");
    if (!content.trim()) return [];
    return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  } catch (err) {
    console.warn(`[pipeline-data] couldn't read ${filename}`, err);
    return [];
  }
}

const num = (v: unknown) => parseInt(String(v ?? "0"), 10) || 0;

function toCreator(r: Record<string, unknown>): Creator {
  return {
    id: String(r.id || ""),
    username: String(r.username || ""),
    category: String(r.category || ""),
    profilePicUrl: String(r.profilePicUrl || ""),
    followers: num(r.followers),
    reelsCount30d: num(r.reelsCount30d),
    avgViews30d: num(r.avgViews30d),
    lastScrapedAt: String(r.lastScrapedAt || ""),
  };
}

function toConfig(r: Record<string, unknown>): Config {
  return {
    id: String(r.id || ""),
    configName: String(r.configName || ""),
    creatorsCategory: String(r.creatorsCategory || ""),
    analysisInstruction: String(r.analysisInstruction || ""),
    newConceptsInstruction: String(r.newConceptsInstruction || ""),
  };
}

function csvVideo(r: Record<string, string>): Video {
  return {
    id: r.id || "",
    link: r.link || r.Link || "",
    thumbnail: r.thumbnail || r.Thumbnail || "",
    creator: r.creator || r.Creator || "",
    views: num(r.views || r.Views),
    likes: num(r.likes || r.Likes),
    comments: num(r.comments || r.Comments),
    analysis: r.analysis || r.Analysis || "",
    newConcepts: r.newConcepts || r["New Concepts"] || "",
    datePosted: r.datePosted || r["Date Posted"] || "",
    dateAdded: r.dateAdded || r["Date Added"] || "",
    configName: r.configName || r["Config Name"] || "",
    starred: r.starred === "true",
  };
}

function fromCsv(kind: Kind): { id: string }[] {
  const rows = readCsv(CSV_FILES[kind]);
  const docs = kind === "creators" ? rows.map(toCreator) : kind === "configs" ? rows.map(toConfig) : rows.map(csvVideo);
  return docs.filter((d) => d.id);
}

/** Copy the old CSV rows into the store once. Returns how many rows were imported. */
async function seedOnce(kind: Kind): Promise<number> {
  const store = getStore();
  const markerId = `seeded_${kind}`;
  if (await store.get(META, markerId)) return 0;
  // No CSV here (e.g. on Vercel): nothing to import, and leave no marker so a later
  // `npm run migrate:pipeline` from a machine that has the files can still import them.
  if (!existsSync(path.join(CSV_DIR, CSV_FILES[kind]))) return 0;
  const docs = fromCsv(kind);
  // Write in small batches so a big videos file doesn't open hundreds of requests at once.
  for (let i = 0; i < docs.length; i += 25) {
    await Promise.all(docs.slice(i, i + 25).map((d) => store.upsert(COLLECTIONS[kind], d)));
  }
  await store.upsert(META, { id: markerId, importedAt: new Date().toISOString(), rows: docs.length });
  if (docs.length) console.info(`[pipeline-data] imported ${docs.length} ${kind} from ${CSV_FILES[kind]}`);
  return docs.length;
}

/** Imports any CSV data that hasn't been imported yet. Used by the migrate script. */
export async function importPipelineCsv(): Promise<Record<Kind, number>> {
  return {
    creators: await seedOnce("creators"),
    configs: await seedOnce("configs"),
    videos: await seedOnce("videos"),
  };
}

async function list<T>(kind: Kind): Promise<T[]> {
  const store = getStore();
  const docs = await store.list<T>(COLLECTIONS[kind]);
  if (docs.length) return docs;
  // Empty: the CSV data may not have been imported yet.
  try {
    if ((await seedOnce(kind)) > 0) return store.list<T>(COLLECTIONS[kind]);
  } catch (err) {
    console.warn(`[pipeline-data] import of ${kind} failed`, err);
  }
  return docs;
}

// ── Creators ──────────────────────────────────────────────────
export async function listCreators(): Promise<Creator[]> {
  return (await list<Record<string, unknown>>("creators")).map(toCreator);
}
export async function getCreator(id: string): Promise<Creator | null> {
  const doc = await getStore().get<Record<string, unknown>>(COLLECTIONS.creators, id);
  return doc ? toCreator(doc) : null;
}
export function saveCreator(creator: Creator): Promise<Creator> {
  return getStore().upsert(COLLECTIONS.creators, toCreator(creator as unknown as Record<string, unknown>));
}
export function deleteCreator(id: string): Promise<void> {
  return getStore().remove(COLLECTIONS.creators, id);
}

// ── Configs ───────────────────────────────────────────────────
export async function listConfigs(): Promise<Config[]> {
  return (await list<Record<string, unknown>>("configs")).map(toConfig);
}
export async function getConfig(id: string): Promise<Config | null> {
  const doc = await getStore().get<Record<string, unknown>>(COLLECTIONS.configs, id);
  return doc ? toConfig(doc) : null;
}
export function saveConfig(config: Config): Promise<Config> {
  return getStore().upsert(COLLECTIONS.configs, toConfig(config as unknown as Record<string, unknown>));
}
export function deleteConfig(id: string): Promise<void> {
  return getStore().remove(COLLECTIONS.configs, id);
}

// ── Videos ────────────────────────────────────────────────────
export function listVideos(): Promise<Video[]> {
  return list<Video>("videos");
}
export function getVideo(id: string): Promise<Video | null> {
  return getStore().get<Video>(COLLECTIONS.videos, id);
}
export async function saveVideos(videos: Video[]): Promise<void> {
  const store = getStore();
  for (let i = 0; i < videos.length; i += 25) {
    await Promise.all(videos.slice(i, i + 25).map((v) => store.upsert(COLLECTIONS.videos, v)));
  }
}
