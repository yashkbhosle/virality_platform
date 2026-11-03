"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

interface ChipListFieldProps {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Values to highlight as problematic (e.g. off-topic pillars). */
  flagged?: string[];
  tone?: "default" | "positive" | "negative";
}

const TONES = {
  default: "bg-violet-500/10 border-violet-500/25 text-violet-700 dark:text-violet-200",
  positive: "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-200",
  negative: "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-200",
};

export function ChipListField({ label, hint, values, onChange, placeholder, flagged = [], tone = "default" }: ChipListFieldProps) {
  const [input, setInput] = useState("");

  const add = () => {
    const parts = input
      .split(/\n|;/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setInput("");
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </div>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => {
            const isFlagged = flagged.includes(v);
            return (
              <span
                key={v}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                  isFlagged
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-200"
                    : TONES[tone]
                }`}
              >
                {v}
                <button
                  type="button"
                  aria-label={`Remove ${v}`}
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  className="rounded p-0.5 opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? "Type and press Enter"}
          className="h-9 flex-1 rounded-xl border border-border bg-background/50 px-3 text-sm outline-none focus:border-violet-500/50"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
