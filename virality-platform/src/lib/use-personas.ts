"use client";

import { useEffect, useState } from "react";
import { PERSONAS_CHANGED_EVENT, useActivePersonaId } from "./active-persona";
import type { Persona } from "./types";

/** Loads saved personas and returns them with the active one. `personas` is null while loading. */
export function usePersonas() {
  const [activeId] = useActivePersonaId();
  const [personas, setPersonas] = useState<Persona[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/personas", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { personas: [] }))
        .then((d) => !cancelled && setPersonas(d.personas ?? []))
        .catch(() => !cancelled && setPersonas([]));
    load();
    window.addEventListener(PERSONAS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PERSONAS_CHANGED_EVENT, load);
    };
  }, []);

  const active = personas?.find((p) => p.id === activeId) ?? null;
  const names: Record<string, string> = Object.fromEntries((personas ?? []).map((p) => [p.id, p.name]));
  return { personas, active, activeId, names };
}
