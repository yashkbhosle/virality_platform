"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplateText } from "@/components/analysis-panel";
import { HookFillPanel } from "@/components/hook-fill-panel";
import { DEFAULT_HOOKS, getHookStructure } from "@/lib/hook-library";
import { formatCount } from "@/lib/creators-shared";
import { usePersonas } from "@/lib/use-personas";
import type { SavedHook } from "@/lib/types";

type Tab = "proven" | "saved";
type UseTarget = { name: string; template: string; variables: { name: string; example: string }[] };

const LABEL = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

function ProvenCard({ hook, onUse }: { hook: (typeof DEFAULT_HOOKS)[number]; onUse: () => void }) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-tight">{hook.name}</h3>
        <Button
          size="sm" onClick={onUse}
          className="h-8 shrink-0 gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-xs text-white hover:opacity-90"
        >
          <Sparkles className="h-3 w-3" /> Use
        </Button>
      </div>
      <p className="text-sm font-medium leading-relaxed"><TemplateText template={hook.template} /></p>
      <div className="space-y-2 text-sm">
        <div>
          <p className={LABEL}>Why it works</p>
          <p className="text-muted-foreground leading-snug">{hook.whyItWorks}</p>
        </div>
        <div>
          <p className={LABEL}>Best for</p>
          <p className="text-muted-foreground leading-snug">{hook.bestFor}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <p className={LABEL}>Example</p>
          <p className="leading-snug italic">“{hook.example}”</p>
        </div>
      </div>
    </div>
  );
}

function SavedCard({ hook, personaName, onUse, onDelete }: {
  hook: SavedHook; personaName?: string; onUse: () => void; onDelete: () => void;
}) {
  const known = getHookStructure(hook.libraryId);
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{hook.structureName}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {known && known.name !== hook.structureName && (
              <span className="text-[10px] rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-700 dark:text-amber-200">≈ {known.name}</span>
            )}
            {personaName && (
              <span className="text-[10px] rounded-full border border-white/[0.1] px-2 py-0.5 text-muted-foreground">{personaName}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm" onClick={onUse}
            className="h-8 gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-xs text-white hover:opacity-90"
          >
            <Sparkles className="h-3 w-3" /> Use
          </Button>
          <button
            onClick={onDelete} title="Delete saved hook"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm font-medium leading-relaxed"><TemplateText template={hook.template} /></p>
      {hook.variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hook.variables.map((v) => (
            <span key={v.name} className="text-[11px] rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5">
              <span className="font-semibold text-orange-600 dark:text-orange-300">{v.name}</span>
              {v.example && <span className="text-muted-foreground"> = “{v.example}”</span>}
            </span>
          ))}
        </div>
      )}
      {hook.sourceVideoUrl && (
        <a
          href={hook.sourceVideoUrl} target="_blank" rel="noopener noreferrer"
          className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{hook.sourceTitle || "Source video"}</span>
          {hook.sourceViews ? <span className="shrink-0">· {formatCount(hook.sourceViews)} views</span> : null}
        </a>
      )}
    </div>
  );
}

export default function HookLibraryPage() {
  const { names } = usePersonas();
  const [tab, setTab] = useState<Tab>("proven");
  const [saved, setSaved] = useState<SavedHook[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [useTarget, setUseTarget] = useState<UseTarget | null>(null);

  const load = () =>
    fetch("/api/saved-hooks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setSaved(d.hooks ?? []);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));

  useEffect(() => {
    load();
  }, []);

  const remove = (id: string) => {
    setSaved((prev) => prev?.filter((h) => h.id !== id) ?? null);
    fetch(`/api/saved-hooks?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) load();
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500">
            <BookOpen className="h-5 w-5 text-white" />
          </span>
          Hook Library
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Proven hook structures and the formulas you saved from viral videos. Hit Use to fill one in for your persona.
        </p>
      </div>

      <div className="flex gap-2">
        {([
          ["proven", `Proven structures (${DEFAULT_HOOKS.length})`],
          ["saved", `My saved hooks${saved ? ` (${saved.length})` : ""}`],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              tab === key
                ? "border-transparent bg-gradient-to-r from-red-500 to-orange-500 text-white"
                : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "proven" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DEFAULT_HOOKS.map((h) => (
            <ProvenCard key={h.id} hook={h} onUse={() => setUseTarget({ name: h.name, template: h.template, variables: [] })} />
          ))}
        </div>
      )}

      {tab === "saved" && (
        loadError ? (
          <div className="glass rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm">Couldn&apos;t load your saved hooks.</p>
            <Button size="sm" variant="outline" className="rounded-full" onClick={load}>Try again</Button>
          </div>
        ) : saved === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved hooks…</p>
        ) : saved.length === 0 ? (
          <div className="glass rounded-2xl p-8 sm:p-14 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
            <h3 className="text-lg font-semibold">No saved hooks yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Analyze a video in <Link href="/keyword-research" className="text-orange-600 dark:text-orange-300 hover:underline">Keyword Research</Link> and
              click &ldquo;Save to Hook Library&rdquo; on its hook formula.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {saved.map((h) => (
              <SavedCard
                key={h.id} hook={h} personaName={h.personaId ? names[h.personaId] : undefined}
                onUse={() => setUseTarget({ name: h.structureName, template: h.template, variables: h.variables })}
                onDelete={() => remove(h.id)}
              />
            ))}
          </div>
        )
      )}

      <Dialog open={!!useTarget} onOpenChange={(open) => !open && setUseTarget(null)}>
        <DialogContent className="sm:max-w-xl">
          {useTarget && (
            <>
              <DialogHeader>
                <DialogTitle>{useTarget.name}</DialogTitle>
                <DialogDescription asChild>
                  <p className="text-sm text-foreground"><TemplateText template={useTarget.template} /></p>
                </DialogDescription>
              </DialogHeader>
              <HookFillPanel key={useTarget.template} template={useTarget.template} variables={useTarget.variables} showSendToScript />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
