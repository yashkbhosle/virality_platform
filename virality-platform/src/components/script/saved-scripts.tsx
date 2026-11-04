"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedScript } from "@/lib/script-flow";

function when(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function SavedScripts({ personaId, refreshKey, onOpen }: { personaId: string; refreshKey: number; onOpen: (s: SavedScript) => void }) {
  const [scripts, setScripts] = useState<SavedScript[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scripts?personaId=${encodeURIComponent(personaId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setScripts(d.scripts ?? []);
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [personaId, refreshKey, reload]);

  const remove = (id: string) => {
    setScripts((prev) => prev?.filter((s) => s.id !== id) ?? null);
    fetch(`/api/scripts/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) setReload((n) => n + 1);
    });
  };

  if (error) {
    return (
      <div className="glass rounded-2xl p-8 text-center space-y-3">
        <p className="text-sm">Couldn&apos;t load your scripts.</p>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setReload((n) => n + 1)}>Try again</Button>
      </div>
    );
  }
  if (scripts === null) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading scripts…</p>;
  }
  if (!scripts.length) {
    return (
      <div className="glass rounded-2xl p-8 sm:p-14 text-center">
        <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
        <h3 className="text-lg font-semibold">No saved scripts yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">Finish a script in the guided flow and click Save.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {scripts.map((s) => (
        <div key={s.id} className="glass rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight">{s.title}</h3>
            <button
              onClick={() => remove(s.id)} title="Delete script"
              className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">“{s.hook}”</p>
          <p className="text-[11px] text-muted-foreground">
            {s.script.wordCount} words · ~{s.script.estSeconds}s · {when(s.updatedAt ?? s.createdAt)}
          </p>
          <Button size="sm" variant="outline" className="mt-auto h-8 w-fit rounded-full text-xs" onClick={() => onOpen(s)}>Open</Button>
        </div>
      ))}
    </div>
  );
}
