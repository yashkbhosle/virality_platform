"use client";

import { useState } from "react";
import { Check, Copy, Download, Loader2, RefreshCw, Save, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { countWords, estimateSeconds, type ScriptDraft } from "@/lib/script-flow";

const LABEL = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const QUICK_EDITS = ["Make it punchier", "Make it shorter", "Add a stat from the research", "More like my voice", "Stronger CTA"];

function scriptToText(d: ScriptDraft) {
  return [
    `TITLE: ${d.title}`,
    "",
    d.fullScript,
    "",
    "---",
    "BEATS:",
    ...d.beats.map((b) => `[${b.time}] ${b.line}\n   Visual: ${b.visual}${b.onScreenText ? `\n   Text: ${b.onScreenText}` : ""}`),
    "",
    `CTA: ${d.cta}`,
    "",
    "SHOT LIST:",
    ...d.shotList.map((s) => `${s.step}. ${s.shot}${s.durationSec ? ` (${s.durationSec}s)` : ""}${s.tip ? ` — ${s.tip}` : ""}`),
    "",
    "CAPTION:",
    d.caption,
  ].join("\n");
}

export function ScriptEditor({
  draft, onChange, lengthSec, busy, saveState, onRewrite, onImprove, onSave,
}: {
  draft: ScriptDraft;
  onChange: (d: ScriptDraft) => void;
  lengthSec: number;
  busy: "rewrite" | "improve" | null;
  saveState: "idle" | "saving" | "saved" | "error";
  onRewrite: () => void;
  onImprove: (instruction: string) => void;
  onSave: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  const setScriptText = (fullScript: string) => {
    const wordCount = countWords(fullScript);
    onChange({ ...draft, fullScript, wordCount, estSeconds: estimateSeconds(wordCount) });
  };

  const download = () => {
    const blob = new Blob([scriptToText(draft)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title.replace(/[^\w\- ]+/g, "").slice(0, 40) || "script"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => {
    navigator.clipboard?.writeText(draft.fullScript).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const improve = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    onImprove(t);
  };

  const overLength = draft.estSeconds > lengthSec * 1.2;
  const disabled = busy !== null;

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })}
            className="h-10 flex-1 min-w-[200px] rounded-xl font-semibold" aria-label="Script title"
          />
          <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full text-xs" onClick={copy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full text-xs" onClick={download}>
            <Download className="h-3 w-3" /> Download .txt
          </Button>
          <Button
            size="sm" onClick={onSave} disabled={saveState === "saving"}
            className="h-9 gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-xs text-white hover:opacity-90"
          >
            {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : saveState === "saved" ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {saveState === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
        {saveState === "error" && <p className="text-xs text-red-600 dark:text-red-300">Couldn&apos;t save this script. Please try again.</p>}

        <div className="space-y-1.5">
          <p className={LABEL}>Script (spoken words) · edit freely</p>
          <Textarea
            value={draft.fullScript} onChange={(e) => setScriptText(e.target.value)} disabled={disabled}
            className="min-h-[260px] rounded-xl text-sm leading-relaxed" aria-label="Script text"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {draft.wordCount} words · ~{draft.estSeconds}s at 2.5 words/sec · target {lengthSec}s
            </span>
            {overLength && <span className="text-amber-600 dark:text-amber-300">Longer than your target. Try &ldquo;Make it shorter&rdquo;.</span>}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2">
          <p className={LABEL}>Improve with AI</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={disabled}
              placeholder='e.g. "make it punchier", "add a stat", "end with a question"'
              className="h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && improve(instruction)}
            />
            <Button size="sm" className="h-9 shrink-0 gap-1.5 rounded-full text-xs" disabled={disabled || !instruction.trim()} onClick={() => improve(instruction)}>
              {busy === "improve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Improve
            </Button>
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full text-xs" disabled={disabled} onClick={onRewrite}>
              {busy === "rewrite" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Rewrite from scratch
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EDITS.map((q) => (
              <button
                key={q} disabled={disabled} onClick={() => improve(q)}
                className="rounded-full border border-white/[0.1] px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {draft.beats.length > 0 && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className={LABEL}>⏱️ Timed beats</p>
          <div className="space-y-2">
            {draft.beats.map((b, i) => (
              <div key={i} className="grid gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:grid-cols-[70px_1fr]">
                <span className="text-xs font-semibold text-orange-600 dark:text-orange-300">{b.time}</span>
                <div className="space-y-1">
                  <p className="text-sm leading-snug">{b.line}</p>
                  {b.visual && <p className="text-[11px] text-muted-foreground">🎥 {b.visual}</p>}
                  {b.onScreenText && <p className="text-[11px] text-muted-foreground">🔤 {b.onScreenText}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {draft.shotList.length > 0 && (
          <div className="glass rounded-2xl p-5 space-y-2">
            <p className={LABEL}>🎬 Shot list · phone only · {done.size}/{draft.shotList.length}</p>
            <ul className="space-y-1.5">
              {draft.shotList.map((s) => {
                const checked = done.has(s.step);
                return (
                  <li key={s.step}>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox" checked={checked} className="mt-1 h-3.5 w-3.5 shrink-0 accent-orange-500"
                        onChange={() => setDone((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.step)) next.delete(s.step);
                          else next.add(s.step);
                          return next;
                        })}
                      />
                      <span className={`text-sm leading-snug ${checked ? "text-muted-foreground line-through" : ""}`}>
                        <b>{s.step}.</b> {s.shot}
                        {s.durationSec > 0 && <span className="text-muted-foreground"> · {s.durationSec}s</span>}
                        {s.tip && <span className="block text-[11px] text-muted-foreground">💡 {s.tip}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="space-y-1">
            <p className={LABEL}>📣 CTA</p>
            <Textarea value={draft.cta} onChange={(e) => onChange({ ...draft, cta: e.target.value })} className="min-h-[60px] rounded-xl text-sm" aria-label="Call to action" />
          </div>
          <div className="space-y-1">
            <p className={LABEL}>📝 Caption</p>
            <Textarea value={draft.caption} onChange={(e) => onChange({ ...draft, caption: e.target.value })} className="min-h-[110px] rounded-xl text-sm" aria-label="Caption" />
          </div>
        </div>
      </div>
    </div>
  );
}
