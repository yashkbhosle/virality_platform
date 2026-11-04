-- ViralOS generic document store (used by src/lib/store.ts).
-- Run once in the Supabase SQL editor.

create table if not exists viralos_docs (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz default now(),
  primary key (collection, id)
);

create index if not exists viralos_docs_collection_updated_idx
  on viralos_docs (collection, updated_at desc);

-- Only the server (service role key) reads/writes this table.
alter table viralos_docs enable row level security;
