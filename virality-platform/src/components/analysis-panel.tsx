"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BookmarkPlus, Check, CheckCircle, Clapperboard, Copy, Download, FileText,
  Loader2, MessageCircle, Repeat, Sparkles, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FrameworkScore, HookFormula, ViralAnalysis, VisualPlaybook } from "@/lib/analysis-prompt";
import { getHookStructure, splitTemplate } from "@/lib/hook-library";
import { usePersonas } from "@/lib/use-personas";
import { HookFillPanel } from "@/components/hook-fill-panel";

export interface TranscriptData {
  transcript: string;
  analysis: ViralAnalysis;
}

/** The video the analysis came from (used when saving a hook formula). */
export interface AnalysisSource {
  url: string;
  title: string;
  views: number;
}

const LABEL = "text-[10px] font-semibold uppercase tracking-wider";

function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined);
}

// ── Score bar ─────────────────────────────────────────────────────────
function ScoreBar({ label, s }: { label: string; s?: FrameworkScore }) {
  if (!s) return null;
  const score = Math.max(0, Math.min(10, Number(s.score) || 0));
  const color = score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xs font-bold">{score}/10</p>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score * 10}%` }} />
      </div>
      {s.note && <p className="text-[11px] text-muted-foreground leading-snug">{s.note}</p>}
    </div>
  );
}

// ── F3: Hook formula card ─────────────────────────────────────────────
export function TemplateText({ template }: { template: string }) {
  return (
    <>
      {splitTemplate(template).map((part, i) =>
        part.isVar ? (
          <span key={i} className="rounded-md bg-orange-500/15 px-1 font-semibold text-orange-600 dark:text-orange-300">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function HookFormulaCard({ formula, source }: { formula: HookFormula; source?: AnalysisSource }) {
  const { activeId } = usePersonas();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "duplicate" | "error">("idle");
  const [fillOpen, setFillOpen] = useState(false);
  const known = getHookStructure(formula.libraryId);

  const save = () => {
    setSaveState("saving");
    fetch("/api/saved-hooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: formula.template,
        structureName: formula.structure || known?.name,
        libraryId: formula.libraryId,
        variables: formula.variables,
        personaId: activeId || undefined,
        sourceVideoUrl: source?.url,
        sourceTitle: source?.title,
        sourceViews: source?.views,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSaveState(d.duplicate ? "duplicate" : "saved"))
      .catch(() => setSaveState("error"));
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`${LABEL} text-amber-600 dark:text-amber-300`}>🧩 HOOK FORMULA</p>
        {(formula.structure || known) && (
          <span className="text-[10px] rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-700 dark:text-amber-200">
            {formula.structure || known?.name}
          </span>
        )}
        {known && formula.structure && known.name !== formula.structure && (
          <span className="text-[10px] text-muted-foreground">≈ {known.name}</span>
        )}
      </div>
      <p className="text-sm leading-relaxed font-medium">
        <TemplateText template={formula.template} />
      </p>
      {formula.variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {formula.variables.map((v) => (
            <span key={v.name} className="text-[11px] rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5">
              <span className="font-semibold text-orange-600 dark:text-orange-300">{v.name}</span>
              {v.example && <span className="text-muted-foreground"> = “{v.example}”</span>}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm" variant="outline" className="h-8 gap-1.5 text-xs rounded-full"
          onClick={save} disabled={saveState === "saving" || saveState === "saved" || saveState === "duplicate"}
        >
          {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" />
            : saveState === "saved" || saveState === "duplicate" ? <Check className="h-3 w-3" />
            : <BookmarkPlus className="h-3 w-3" />}
          {saveState === "saved" ? "Saved to Hook Library" : saveState === "duplicate" ? "Already in Hook Library" : "Save to Hook Library"}
        </Button>
        <Button
          size="sm" className="h-8 gap-1.5 text-xs rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90"
          onClick={() => setFillOpen((v) => !v)}
        >
          <Sparkles className="h-3 w-3" /> Use with my persona
        </Button>
      </div>
      {saveState === "error" && <p className="text-xs text-red-600 dark:text-red-300">Couldn&apos;t save this hook. Please try again.</p>}

      {fillOpen && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <HookFillPanel template={formula.template} variables={formula.variables} showSendToScript />
        </div>
      )}
    </div>
  );
}

// ── F4: Visual playbook ───────────────────────────────────────────────
function shotListText(p: VisualPlaybook) {
  return p.beginnerShotList
    .map((s) => `${s.step}. ${s.shot}${s.durationSec ? ` (${s.durationSec}s)` : ""}${s.tip ? ` — ${s.tip}` : ""}`)
    .join("\n");
}

function VisualPlaybookCard({ playbook }: { playbook: VisualPlaybook }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const rows: { label: string; value: string }[] = [
    { label: "Camera", value: playbook.camera },
    { label: "Setting", value: playbook.setting },
    { label: "B-roll", value: playbook.bRoll.join(" · ") },
    { label: "On-screen text", value: playbook.onScreenText },
    { label: "Editing", value: playbook.editing },
    { label: "Audio", value: playbook.audio },
    { label: "Colour & lighting", value: playbook.colorAndLighting },
    { label: "Length", value: playbook.lengthSeconds ? `~${playbook.lengthSeconds}s` : "" },
  ].filter((r) => r.value);

  const toggle = (step: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });

  return (
    <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 space-y-3">
      <p className={`${LABEL} text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5`}>
        <Clapperboard className="h-3 w-3" /> 🎬 HOW IT WAS FILMED
      </p>
      {playbook.inferred && (
        <p className="text-[11px] text-muted-foreground">
          Best guess from the caption and audio. We can&apos;t watch Instagram videos directly, so check the reel itself.
        </p>
      )}
      {rows.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground sm:pt-0.5">{r.label}</dt>
              <dd className="text-sm leading-snug -mt-1.5 sm:mt-0">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {playbook.beginnerShotList.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={`${LABEL} text-muted-foreground`}>
              YOUR SHOT LIST · PHONE ONLY · {done.size}/{playbook.beginnerShotList.length}
            </p>
            <Button
              size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
              onClick={() => {
                copyText(shotListText(playbook));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />} {copied ? "Copied" : "Copy shot list"}
            </Button>
          </div>
          <ul className="space-y-1.5">
            {playbook.beginnerShotList.map((s) => {
              const checked = done.has(s.step);
              return (
                <li key={s.step}>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox" checked={checked} onChange={() => toggle(s.step)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-orange-500"
                    />
                    <span className={`text-sm leading-snug ${checked ? "line-through text-muted-foreground" : ""}`}>
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
    </div>
  );
}

// ── Analysis panel ────────────────────────────────────────────────────
export function AnalysisPanel({ data, source, onDownload }: { data: TranscriptData; source?: AnalysisSource; onDownload: () => void }) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const a = data.analysis;
  return (
    <div className="border-t border-white/[0.06] p-5 space-y-4">
      {source && (
        <div className="flex justify-end">
          <Link
            href={`/script-writer?videoUrl=${encodeURIComponent(source.url)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <FileText className="h-3 w-3" /> Write a script from this video
          </Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Hook Type", val: a.hookType, color: "text-orange-600 dark:text-orange-300" },
          { label: "Format",    val: a.format,   color: "text-blue-600 dark:text-blue-300"   },
          { label: "CTA",       val: a.cta,      color: "text-green-600 dark:text-green-300"  },
          { label: "Topics",    val: a.keyTopics?.slice(0, 2).join(", "), color: "text-purple-600 dark:text-purple-300" },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-xs font-semibold ${color} leading-tight`}>{val || "—"}</p>
          </div>
        ))}
      </div>
      {a.reachAssessment && (
        <div className={`rounded-xl p-3 border text-xs flex items-start gap-2 ${
          a.reachAssessment === "likely paid"
            ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300"
            : a.reachAssessment === "organic"
              ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300"
              : "bg-white/[0.03] border-white/[0.08] text-muted-foreground"
        }`}>
          {a.reachAssessment === "likely paid" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          <span><b className="uppercase tracking-wider text-[10px]">Reach: {a.reachAssessment}</b>{a.reachReason ? ` — ${a.reachReason}` : ""}</span>
        </div>
      )}
      {a.targetAvatar && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
          <p className={`${LABEL} text-muted-foreground mb-2 flex items-center gap-1.5`}><Target className="h-3 w-3" /> TARGET AVATAR</p>
          <p className="text-sm leading-relaxed">{a.targetAvatar}</p>
        </div>
      )}
      {(a.hookStrength || a.engagementRules) && (
        <div className="space-y-2">
          <p className={`${LABEL} text-muted-foreground`}>SCORECARD · HOOK + 4 ENGAGEMENT RULES</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <ScoreBar label="Hook strength" s={a.hookStrength} />
            <ScoreBar label="1 · Relevance" s={a.engagementRules?.relevance} />
            <ScoreBar label="2 · Non-obvious" s={a.engagementRules?.nonObvious} />
            <ScoreBar label="3 · Easy to absorb" s={a.engagementRules?.absorption} />
            <ScoreBar label="4 · Short distance" s={a.engagementRules?.shortDistance} />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
          <p className={`${LABEL} text-orange-600 dark:text-orange-300 mb-2`}>🎣 HOOK</p>
          <p className="text-sm leading-relaxed">{a.hook}</p>
        </div>
        {a.hookFormula && <HookFormulaCard formula={a.hookFormula} source={source} />}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <p className={`${LABEL} text-blue-600 dark:text-blue-300 mb-2`}>🔥 WHY VIRAL</p>
          <p className="text-sm leading-relaxed">{a.whyViral}</p>
        </div>
        {a.visualPlaybook && <VisualPlaybookCard playbook={a.visualPlaybook} />}
        {a.contentFormat && (
          <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
            <p className={`${LABEL} text-purple-600 dark:text-purple-300 mb-2`}>📐 CONTENT BREAKDOWN</p>
            <p className="text-sm leading-relaxed">{a.contentFormat}</p>
          </div>
        )}
        {!!a.commentTriggers?.length && (
          <div className="bg-pink-500/5 border border-pink-500/20 rounded-xl p-4">
            <p className={`${LABEL} text-pink-600 dark:text-pink-300 mb-2 flex items-center gap-1.5`}><MessageCircle className="h-3 w-3" /> COMMENT TRIGGERS</p>
            <ul className="text-sm leading-relaxed list-disc pl-4 space-y-1">
              {a.commentTriggers.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
        {!!a.retentionTactics?.length && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <p className={`${LABEL} text-muted-foreground mb-2`}>⏱️ RETENTION TACTICS</p>
            <ul className="text-sm leading-relaxed list-disc pl-4 space-y-1">
              {a.retentionTactics.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
        {!!a.replicate?.length && (
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
            <p className={`${LABEL} text-green-600 dark:text-green-300 mb-2 flex items-center gap-1.5`}><Repeat className="h-3 w-3" /> HOW TO REPLICATE</p>
            <ol className="text-sm leading-relaxed list-decimal pl-4 space-y-1">
              {a.replicate.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </div>
        )}
        {a.keyTopics?.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <p className={`${LABEL} text-muted-foreground mb-2`}>🏷️ KEY TOPICS</p>
            <div className="flex flex-wrap gap-1.5">
              {a.keyTopics.map((t, i) => (
                <span key={i} className="text-[11px] bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-0.5">{t}</span>
              ))}
            </div>
          </div>
        )}
        {data.transcript ? (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className={`${LABEL} text-muted-foreground`}>📝 TRANSCRIPT</p>
              <div className="flex gap-2">
                <button onClick={() => setShowFullTranscript(v => !v)} className="text-[10px] text-blue-600 dark:text-blue-300 hover:underline">
                  {showFullTranscript ? "Show less" : "Show full"}
                </button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground px-2" onClick={onDownload}>
                  <Download className="h-2.5 w-2.5" /> Download
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {showFullTranscript ? data.transcript : data.transcript.slice(0, 500) + (data.transcript.length > 500 ? "…" : "")}
            </p>
          </div>
        ) : (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
            <p className={`${LABEL} text-muted-foreground mb-1`}>📝 TRANSCRIPT</p>
            <p className="text-xs text-muted-foreground">No transcript available — analysis based on caption and engagement metrics.</p>
          </div>
        )}
      </div>
    </div>
  );
}
