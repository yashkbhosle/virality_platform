// Small document store used by API routes (server-side only).
//
// Backends:
//  - Supabase, when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
//    Uses one generic table `viralos_docs` (see supabase/schema.sql).
//  - JSON files at ../data/<collection>.json otherwise (works locally;
//    does NOT persist on Vercel).
//
// Never import this from a client component: the service role key must stay on the server.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync } from "fs";
import { readFile, writeFile, rename } from "fs/promises";
import path from "path";

if (typeof window !== "undefined") {
  throw new Error("store.ts must only be used on the server");
}

export interface Store {
  list<T>(collection: string): Promise<T[]>;
  get<T>(collection: string, id: string): Promise<T | null>;
  upsert<T extends { id: string }>(collection: string, doc: T): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
}

const TABLE = "viralos_docs";

function assertName(collection: string) {
  if (!/^[a-z0-9_]+$/i.test(collection)) {
    throw new Error(`Invalid collection name: ${collection}`);
  }
}

// ── Supabase backend ────────────────────────────────────────────────────────

class SupabaseStore implements Store {
  constructor(private client: SupabaseClient) {}

  async list<T>(collection: string): Promise<T[]> {
    assertName(collection);
    const { data, error } = await this.client
      .from(TABLE)
      .select("data")
      .eq("collection", collection)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Store list failed: ${error.message}`);
    return (data ?? []).map((row) => row.data as T);
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    assertName(collection);
    const { data, error } = await this.client
      .from(TABLE)
      .select("data")
      .eq("collection", collection)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Store get failed: ${error.message}`);
    return data ? (data.data as T) : null;
  }

  async upsert<T extends { id: string }>(collection: string, doc: T): Promise<T> {
    assertName(collection);
    const { error } = await this.client
      .from(TABLE)
      .upsert({ collection, id: doc.id, data: doc, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Store upsert failed: ${error.message}`);
    return doc;
  }

  async remove(collection: string, id: string): Promise<void> {
    assertName(collection);
    const { error } = await this.client.from(TABLE).delete().eq("collection", collection).eq("id", id);
    if (error) throw new Error(`Store remove failed: ${error.message}`);
  }
}

// ── JSON file backend ───────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "..", "data");

class JsonFileStore implements Store {
  // Serialise writes per collection so concurrent requests don't clobber each other.
  private locks = new Map<string, Promise<unknown>>();

  private file(collection: string) {
    assertName(collection);
    return path.join(DATA_DIR, `${collection}.json`);
  }

  private async readAll<T>(collection: string): Promise<T[]> {
    const file = this.file(collection);
    if (!existsSync(file)) return [];
    try {
      const raw = await readFile(file, "utf-8");
      const parsed = raw.trim() ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async writeAll<T>(collection: string, docs: T[]) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const file = this.file(collection);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(docs, null, 2), "utf-8");
    await rename(tmp, file);
  }

  private withLock<R>(collection: string, fn: () => Promise<R>): Promise<R> {
    const prev = this.locks.get(collection) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(collection, next.catch(() => undefined));
    return next;
  }

  async list<T>(collection: string): Promise<T[]> {
    return this.readAll<T>(collection);
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const docs = await this.readAll<T & { id: string }>(collection);
    return docs.find((d) => d.id === id) ?? null;
  }

  upsert<T extends { id: string }>(collection: string, doc: T): Promise<T> {
    return this.withLock(collection, async () => {
      const docs = await this.readAll<T>(collection);
      const idx = docs.findIndex((d) => d.id === doc.id);
      if (idx === -1) docs.unshift(doc);
      else docs[idx] = doc;
      await this.writeAll(collection, docs);
      return doc;
    });
  }

  remove(collection: string, id: string): Promise<void> {
    return this.withLock(collection, async () => {
      const docs = await this.readAll<{ id: string }>(collection);
      await this.writeAll(collection, docs.filter((d) => d.id !== id));
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }))
      : new JsonFileStore();
  return cached;
}

export function storeBackend(): "supabase" | "json" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "json";
}
