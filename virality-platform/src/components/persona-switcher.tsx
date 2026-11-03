"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserCircle2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERSONAS_CHANGED_EVENT, useActivePersonaId } from "@/lib/active-persona";

interface PersonaOption {
  id: string;
  name: string;
}

export function PersonaSwitcher() {
  const [activeId, setActiveId] = useActivePersonaId();
  const [personas, setPersonas] = useState<PersonaOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/personas", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const list: PersonaOption[] = (Array.isArray(data) ? data : data.personas ?? []).map(
          (p: PersonaOption) => ({ id: p.id, name: p.name })
        );
        if (!cancelled) setPersonas(list);
      } catch {
        if (!cancelled) setPersonas([]);
      }
    };
    load();
    window.addEventListener(PERSONAS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PERSONAS_CHANGED_EVENT, load);
    };
  }, []);

  // Drop a stale active id (persona deleted), or pick the first persona if none is active.
  useEffect(() => {
    if (!personas) return;
    if (activeId && personas.some((p) => p.id === activeId)) return;
    setActiveId(personas[0]?.id ?? null);
  }, [personas, activeId, setActiveId]);

  return (
    <div className="mt-5">
      <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
        Active persona
      </p>
      {personas === null ? (
        <div className="h-9 rounded-xl bg-muted/40 animate-pulse" />
      ) : personas.length === 0 ? (
        <Link
          href="/persona"
          className="flex h-9 items-center gap-2 rounded-xl border border-dashed border-violet-500/40 px-3 text-[12px] text-violet-600 dark:text-violet-300 hover:bg-violet-500/10 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Create your persona
        </Link>
      ) : (
        <Select value={activeId ?? undefined} onValueChange={(v) => setActiveId(v)}>
          <SelectTrigger className="h-9 w-full rounded-xl text-[12px]">
            <UserCircle2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
            <SelectValue placeholder="Choose a persona" />
          </SelectTrigger>
          <SelectContent>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-[12px]">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
