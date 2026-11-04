// One-time copy of the old ../data/*.csv files (Creators, Configs, Videos) into the
// app's store, so the deployed site shows them. Uses the same .env as the app
// (repo root), so with Supabase set there it writes to Supabase.
//
//   npm run migrate:pipeline
//
// Safe to run more than once: each file is imported only the first time.

import path from "path";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), "..", ".env") });

(async () => {
  const { importPipelineCsv } = await import("../src/lib/pipeline-data");
  const counts = await importPipelineCsv();
  console.log("Imported rows:", counts, "(0 means already imported or no file)");
})().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
