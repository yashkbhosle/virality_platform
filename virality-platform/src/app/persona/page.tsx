"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, RotateCcw, Sparkles, Trash2, UserCircle2, PenLine } from "lucide-react";
import { PersonaForm } from "@/components/persona/persona-form";
import { emptyPersonaDraft, type PersonaDraft } from "@/lib/persona";
import { notifyPersonasChanged, useActivePersonaId } from "@/lib/active-persona";
import type { Persona } from "@/lib/types";

type View =
  | { kind: "list" }
  | { kind: "describe" }
  | { kind: "edit"; draft: PersonaDraft; personaId?: string; generated?: boolean };

function toDraft(p: Persona): PersonaDraft {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, updatedAt, ...draft } = p;
  return draft;
}

export default function PersonaPage() {
  const [activeId, setActiveId] = useActivePersonaId();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/personas", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load your personas.");
      const list: Persona[] = data.personas ?? [];
      setPersonas(list);
      if (list.length === 0) setView((v) => (v.kind === "list" ? { kind: "describe" } : v));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your personas.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/personas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.draft) throw new Error(data.error || "We couldn't generate a persona right now.");
      setView({ kind: "edit", draft: data.draft, generated: true });
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "We couldn't generate a persona right now.");
    } finally {
      setGenerating(false);
    }
  };

  const onSaved = (p: Persona) => {
    setPersonas((prev) => [p, ...(prev ?? []).filter((x) => x.id !== p.id)]);
    setActiveId(p.id);
    notifyPersonasChanged();
    setView({ kind: "list" });
    setDescription("");
  };

  const remove = async (p: Persona) => {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/personas/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const rest = (personas ?? []).filter((x) => x.id !== p.id);
      setPersonas(rest);
      if (activeId === p.id) setActiveId(rest[0]?.id ?? null);
      notifyPersonasChanged();
      if (rest.length === 0) setView({ kind: "describe" });
    } catch {
      window.alert("Couldn't delete this persona. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const hasPersonas = (personas?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <UserCircle2 className="h-5 w-5 text-white" />
            </span>
            Persona
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who you are, the one viewer you talk to, and how you sound. Every hook and script uses your active persona.
          </p>
        </div>
        {view.kind === "list" && hasPersonas && (
          <button onClick={() => setView({ kind: "describe" })}
            className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20">
            <Plus className="h-4 w-4" /> New persona
          </button>
        )}
      </div>

      {loadError && (
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4 text-sm">
          <span className="text-rose-600 dark:text-rose-300">{loadError}</span>
          <button onClick={load} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {personas === null && !loadError && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="glass h-40 animate-pulse rounded-2xl" />)}
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────── */}
      {view.kind === "list" && hasPersonas && (
        <div className="grid gap-4 sm:grid-cols-2">
          {personas!.map((p) => {
            const isActive = p.id === activeId;
            return (
              <div key={p.id}
                className={`glass flex flex-col rounded-2xl p-5 transition-all ${isActive ? "ring-1 ring-violet-500/50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.niche}</p>
                  </div>
                  {isActive ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-200">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <button onClick={() => setActiveId(p.id)}
                      className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                      Set active
                    </button>
                  )}
                </div>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Talking to</p>
                <p className="mt-0.5 text-sm">{p.avatar.who}</p>
                {p.topics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.topics.map((t) => (
                      <span key={t} className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-200">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex gap-2 pt-4">
                  <button onClick={() => setView({ kind: "edit", draft: toDraft(p), personaId: p.id })}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => remove(p)} disabled={deletingId === p.id}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-rose-600 dark:hover:text-rose-300 disabled:opacity-40">
                    {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Describe (AI onboarding) ─────────────────────────── */}
      {view.kind === "describe" && personas !== null && (
        <div className="glass space-y-4 rounded-2xl p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Step 1 of 2</p>
            <p className="mt-1 font-semibold">Describe yourself and who you help in 1–2 sentences</p>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="e.g. I'm a mortgage agent in Brampton helping first-time buyers get into their first home."
            className="w-full resize-none rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none focus:border-violet-500/50" />
          {generateError && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-200">
              {generateError}
              <button onClick={generate} className="inline-flex items-center gap-1 underline"><RotateCcw className="h-3 w-3" /> Retry</button>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button onClick={generate} disabled={generating || description.trim().length < 10}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-50">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Building your persona…</> : <><Sparkles className="h-4 w-4" /> Generate</>}
            </button>
            <button onClick={() => setView({ kind: "edit", draft: emptyPersonaDraft() })}
              className="flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:text-foreground">
              <PenLine className="h-4 w-4" /> Fill in manually
            </button>
            {hasPersonas && (
              <button onClick={() => setView({ kind: "list" })} className="h-11 px-3 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit form ────────────────────────────────────────── */}
      {view.kind === "edit" && (
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {view.personaId ? "Edit persona" : view.generated ? "Step 2 of 2 · Review and edit your draft" : "New persona"}
          </p>
          <PersonaForm
            key={view.personaId ?? "new"}
            initial={view.draft}
            personaId={view.personaId}
            onSaved={onSaved}
            onCancel={() => setView(hasPersonas ? { kind: "list" } : { kind: "describe" })}
          />
        </div>
      )}
    </div>
  );
}
