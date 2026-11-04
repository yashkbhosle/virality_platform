"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, FileText, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePersonas } from "@/lib/use-personas";

type FilledHook = { text: string; note: string };

export function scriptWriterHref(hook: string, topic?: string) {
  const q = new URLSearchParams({ hook });
  if (topic) q.set("topic", topic);
  return `/script-writer?${q.toString()}`;
}

/**
 * Fills a hook template with the active persona via /api/hooks/fill.
 * Shows a "create persona" prompt when none is active.
 */
export function HookFillPanel({
  template,
  variables = [],
  showSendToScript = false,
}: {
  template: string;
  variables?: { name: string; example: string }[];
  showSendToScript?: boolean;
}) {
  const { active, personas } = usePersonas();
  const [topic, setTopic] = useState("");
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState("");
  const [hooks, setHooks] = useState<FilledHook[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const fill = () => {
    if (!active) return;
    setFilling(true);
    setError("");
    fetch("/api/hooks/fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, variables, personaId: active.id, topic }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Couldn't write hooks right now. Please try again.");
        setHooks(d.hooks ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't write hooks right now. Please try again."))
      .finally(() => setFilling(false));
  };

  const copyHook = (i: number, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
  };

  if (personas === null) {
    return <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading personas…</p>;
  }
  if (!active) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Hooks are written in your persona&apos;s voice. {personas.length ? "Pick a persona in the sidebar first." : "Create a persona first."}</span>
        <Link href="/persona" className="font-semibold text-orange-600 dark:text-orange-300 hover:underline">
          {personas.length ? "Manage personas" : "Create persona"} →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic for this video (optional)" className="h-8 text-xs"
          onKeyDown={(e) => e.key === "Enter" && !filling && fill()}
        />
        <Button size="sm" className="h-8 text-xs rounded-full shrink-0" onClick={fill} disabled={filling}>
          {filling ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Writing…</> : hooks.length ? "Write 5 more" : `Write 5 hooks as ${active.name}`}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-300">
          {error} <button className="underline" onClick={fill}>Retry</button>
        </p>
      )}
      {hooks.length > 0 && (
        <ul className="space-y-2">
          {hooks.map((h, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{h.text}</p>
                {h.note && <p className="text-[11px] text-muted-foreground mt-0.5">{h.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {showSendToScript && (
                  <Link
                    href={scriptWriterHref(h.text, topic)} title="Send to Script Writer"
                    className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/[0.08] text-muted-foreground"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  onClick={() => copyHook(i, h.text)} title="Copy hook"
                  className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/[0.08] text-muted-foreground"
                >
                  {copied === i ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-300" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
