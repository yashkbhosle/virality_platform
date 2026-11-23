"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Small inline picker for which persona a tracked creator belongs to.
 * Shows "for <persona>" and lets you switch it, or clear it with "No persona".
 */
export function PersonaTagSelect({ value, personas, onChange }: {
  value?: string;
  personas: { id: string; name: string }[] | null;
  onChange: (personaId: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  if (!personas || (personas.length === 0 && !value)) return null;
  // A persona that was deleted still shows, so the user can see and change it.
  const known = !value || personas.some((p) => p.id === value);

  return (
    <label className="inline-flex max-w-full items-center gap-1 text-[11px] text-muted-foreground">
      <span>for</span>
      <select
        value={value ?? ""}
        disabled={saving}
        title="Which persona you're tracking this creator for"
        aria-label="Persona for this creator"
        onChange={async (e) => {
          setSaving(true);
          try {
            await onChange(e.target.value || null);
          } catch (err) {
            alert(err instanceof Error ? err.message : "Couldn't change the persona. Please try again.");
          } finally {
            setSaving(false);
          }
        }}
        className="max-w-[16rem] truncate rounded-md border border-white/[0.1] bg-transparent px-1.5 py-0.5 text-[11px] text-foreground hover:border-white/[0.2] focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50 [&>option]:bg-background"
      >
        <option value="">No persona</option>
        {!known && <option value={value}>(deleted persona)</option>}
        {personas.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {saving && <Loader2 className="h-3 w-3 animate-spin" />}
    </label>
  );
}
