"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Check, ExternalLink, Lightbulb, Loader2, PenLine, PlaySquare, RefreshCw, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TemplateText } from "@/components/analysis-panel";
import { ScriptEditor } from "./script-editor";
import { errorMessage, postJSON } from "./post-json";
import { formatCount } from "@/lib/creators-shared";
import { listRecentAnalyses, outliersForScript, type RecentAnalysis } from "@/lib/recent-analyses";
import {
  SCRIPT_LENGTHS, analysisToVideoSource, isHighStakesNiche,
  type HookOption, type Research, type SavedScript, type ScriptDraft, type ScriptSource,
} from "@/lib/script-flow";
import type { Persona, SavedHook } from "@/lib/types";

const LABEL = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const STEPS = ["Topic", "Research", "Hook", "Script"] as const;
type SourceKind = ScriptSource["kind"];

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-300">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

function Stepper({ step, maxStep, onGo }: { step: number; maxStep: number; onGo: (s: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const reachable = n <= maxStep;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              disabled={!reachable} onClick={() => onGo(n)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                current
                  ? "border-transparent bg-gradient-to-r from-red-500 to-orange-500 text-white"
                  : reachable
                    ? "glass border-white/[0.1] text-foreground hover:bg-white/[0.06]"
                    : "border-white/[0.06] text-muted-foreground/60"
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${current ? "bg-white/25" : "bg-white/[0.08]"}`}>
                {n < maxStep && !current ? <Check className="h-2.5 w-2.5" /> : n}
              </span>
              {label}
            </button>
            {n < STEPS.length && <span className="text-muted-foreground/40">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function GuidedFlow({
  persona, initialVideoUrl, initialHook, initialTopic, openScript, onSaved,
}: {
  persona: Persona;
  initialVideoUrl?: string;
  initialHook?: string;
  initialTopic?: string;
  openScript?: SavedScript | null;
  onSaved?: () => void;
}) {
  const [step, setStep] = useState(openScript ? 4 : 1);
  const [maxStep, setMaxStep] = useState(openScript ? 4 : 1);

  // Step 1
  const [kind, setKind] = useState<SourceKind>(openScript?.source?.kind ?? (initialVideoUrl ? "video" : "topic"));
  const [recent, setRecent] = useState<RecentAnalysis[]>([]);
  const [savedHooks, setSavedHooks] = useState<SavedHook[] | null>(null);
  const [videoUrl, setVideoUrl] = useState(openScript?.source?.video?.url ?? initialVideoUrl ?? "");
  const [savedHookId, setSavedHookId] = useState("");
  const [topic, setTopic] = useState(openScript?.source?.topic ?? initialTopic ?? "");
  const [direction, setDirection] = useState(openScript?.source?.direction ?? "");
  const [source, setSource] = useState<ScriptSource | null>(openScript?.source ?? null);

  // Step 2
  const [research, setResearch] = useState<Research | null>(openScript?.research ?? null);

  // Step 3
  const [hookOptions, setHookOptions] = useState<HookOption[]>([]);
  const [usedOutliers, setUsedOutliers] = useState(false);
  // A hook that arrives from a saved script or the Hook Library sits in the "own hook" box.
  const [customHook, setCustomHook] = useState(openScript?.hook ?? initialHook ?? "");
  const [chosenHook, setChosenHook] = useState(openScript?.hook || initialHook ? "__custom__" : "");
  const [lengthSec, setLengthSec] = useState<number>(openScript?.lengthSec ?? 30);

  // Step 4
  const [draft, setDraft] = useState<ScriptDraft | null>(openScript?.script ?? null);
  const [savedId, setSavedId] = useState(openScript?.id ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(openScript ? "saved" : "idle");
  const [editBusy, setEditBusy] = useState<"rewrite" | "improve" | null>(null);

  const [loading, setLoading] = useState<null | "research" | "hooks" | "more" | "script">(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(listRecentAnalyses()).then((list) => {
      if (cancelled) return;
      setRecent(list);
      // Default the topic to the deep-linked video's title.
      const linked = initialVideoUrl ? list.find((a) => a.url === initialVideoUrl) : undefined;
      if (linked) setTopic((t) => t || linked.title);
    });
    fetch(`/api/saved-hooks?personaId=${encodeURIComponent(persona.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { hooks: [] }))
      .then((d) => !cancelled && setSavedHooks(d.hooks ?? []))
      .catch(() => !cancelled && setSavedHooks([]));
    return () => {
      cancelled = true;
    };
  }, [persona.id, initialVideoUrl]);

  const selectedVideo = recent.find((a) => a.url === videoUrl);
  const selectedSavedHook = savedHooks?.find((h) => h.id === savedHookId);
  const highStakes = isHighStakesNiche(`${persona.niche} ${persona.topics.join(" ")} ${topic}`);
  const go = (n: number) => {
    setError(null);
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  };

  // ── Step actions ───────────────────────────────────────────────────
  const buildSource = (): ScriptSource | null => {
    const t = topic.trim();
    if (!t) return null;
    const base: ScriptSource = { kind, topic: t, direction: direction.trim() || undefined };
    if (kind === "video" && selectedVideo) {
      base.video = analysisToVideoSource(
        { url: selectedVideo.url, title: selectedVideo.title, creator: selectedVideo.creator, views: selectedVideo.views, platform: selectedVideo.platform },
        selectedVideo.analysis
      );
    }
    if (kind === "hook" && selectedSavedHook) {
      base.savedHook = { template: selectedSavedHook.template, structureName: selectedSavedHook.structureName };
    }
    return base;
  };

  const runResearch = (src: ScriptSource) => {
    setLoading("research");
    setError(null);
    postJSON<{ research: Research }>("/api/script/research", { personaId: persona.id, source: src })
      .then((d) => {
        setResearch(d.research);
        setHookOptions([]);
        go(2);
      })
      .catch((e) => setError({ message: errorMessage(e), retry: () => runResearch(src) }))
      .finally(() => setLoading(null));
  };

  const startResearch = () => {
    const src = buildSource();
    if (!src) return;
    setSource(src);
    runResearch(src);
  };

  const runHooks = (more = false) => {
    if (!source) return;
    const { outliers } = outliersForScript();
    setLoading(more ? "more" : "hooks");
    setError(null);
    postJSON<{ hooks: HookOption[]; usedOutliers: boolean }>("/api/script/hooks", {
      personaId: persona.id, source, research, outliers, avoid: more ? hookOptions.map((h) => h.text) : [],
    })
      .then((d) => {
        setUsedOutliers(d.usedOutliers);
        setHookOptions((prev) => (more ? [...prev, ...d.hooks] : d.hooks));
        if (!more) go(3);
      })
      .catch((e) => setError({ message: errorMessage(e), retry: () => runHooks(more) }))
      .finally(() => setLoading(null));
  };

  const finalHook = chosenHook === "__custom__" ? customHook.trim() : chosenHook;

  const runScript = (mode: "first" | "rewrite") => {
    if (!source || !finalHook) return;
    if (mode === "rewrite") setEditBusy("rewrite");
    else setLoading("script");
    setError(null);
    postJSON<{ script: ScriptDraft }>("/api/script/generate", {
      personaId: persona.id, source, research, hook: finalHook, lengthSec,
    })
      .then((d) => {
        setDraft(d.script);
        setSaveState("idle");
        go(4);
      })
      .catch((e) => setError({ message: errorMessage(e), retry: () => runScript(mode) }))
      .finally(() => {
        setLoading(null);
        setEditBusy(null);
      });
  };

  const improve = (instruction: string) => {
    if (!draft) return;
    setEditBusy("improve");
    setError(null);
    postJSON<{ script: ScriptDraft }>("/api/script/revise", { personaId: persona.id, script: draft, research, instruction })
      .then((d) => {
        setDraft(d.script);
        setSaveState("idle");
      })
      .catch((e) => setError({ message: errorMessage(e), retry: () => improve(instruction) }))
      .finally(() => setEditBusy(null));
  };

  const save = () => {
    if (!draft) return;
    setSaveState("saving");
    postJSON<{ script: SavedScript }>("/api/scripts", {
      id: savedId || undefined, personaId: persona.id, source, hook: finalHook, research, script: draft, lengthSec,
    })
      .then((d) => {
        setSavedId(d.script.id);
        setSaveState("saved");
        onSaved?.();
      })
      .catch(() => setSaveState("error"));
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Stepper step={step} maxStep={maxStep} onGo={go} />
      {error && <ErrorBox message={error.message} onRetry={error.retry} />}

      {step === 1 && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <div>
            <p className={LABEL}>Start from</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {([
                ["video", PlaySquare, "An analyzed video", "Remix a viral video you analyzed in Keyword Research"],
                ["hook", BookOpen, "A saved hook", "Build on a formula from your Hook Library"],
                ["topic", PenLine, "Your own topic", "Start from an idea you already have"],
              ] as const).map(([k, Icon, title, desc]) => (
                <button
                  key={k} onClick={() => setKind(k)}
                  className={`rounded-2xl border p-3 text-left transition-colors ${kind === k ? "border-orange-500/50 bg-orange-500/10" : "glass border-white/[0.08] hover:bg-white/[0.04]"}`}
                >
                  <Icon className={`h-4 w-4 ${kind === k ? "text-orange-600 dark:text-orange-300" : "text-muted-foreground"}`} />
                  <p className="mt-1.5 text-sm font-semibold">{title}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {kind === "video" && (
            recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No analyzed videos yet. Open <Link href="/keyword-research" className="text-orange-600 dark:text-orange-300 hover:underline">Keyword Research</Link>,
                click Analyze on a video, then &ldquo;Write a script from this video&rdquo;.
              </p>
            ) : (
              <div className="space-y-2">
                <p className={LABEL}>Recently analyzed</p>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {recent.map((a) => (
                    <button
                      key={a.url}
                      onClick={() => {
                        setVideoUrl(a.url);
                        setTopic(a.title);
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${videoUrl === a.url ? "border-orange-500/50 bg-orange-500/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"}`}
                    >
                      <span className="mt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{a.platform === "youtube" ? "YT" : "IG"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {a.creator}{a.views ? ` · ${formatCount(a.views)} views` : ""}{a.analysis.hookFormula ? ` · ${a.analysis.hookFormula.structure}` : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {initialVideoUrl && !recent.some((a) => a.url === initialVideoUrl) && (
                  <p className="text-xs text-amber-600 dark:text-amber-300">That video&apos;s analysis isn&apos;t in this browser any more. Analyze it again or pick another.</p>
                )}
              </div>
            )
          )}

          {kind === "hook" && (
            savedHooks === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved hooks…</p>
            ) : savedHooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved hooks for {persona.name} yet. Save one from a video analysis, or browse the <Link href="/hook-library" className="text-orange-600 dark:text-orange-300 hover:underline">Hook Library</Link>.
              </p>
            ) : (
              <div className="space-y-2">
                <p className={LABEL}>Your saved hooks</p>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {savedHooks.map((h) => (
                    <button
                      key={h.id} onClick={() => setSavedHookId(h.id)}
                      className={`w-full rounded-xl border p-3 text-left text-sm ${savedHookId === h.id ? "border-orange-500/50 bg-orange-500/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"}`}
                    >
                      <span className="block text-[11px] text-muted-foreground">{h.structureName}</span>
                      <TemplateText template={h.template} />
                    </button>
                  ))}
                </div>
              </div>
            )
          )}

          {initialHook && (
            <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs">
              <span className={LABEL}>Hook from the library</span><br />
              <span className="text-sm">{initialHook}</span>
            </p>
          )}

          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="sw-topic">Topic</label>
            <Input id="sw-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this video about?" className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="sw-direction">Your direction</label>
            <Textarea
              id="sw-direction" value={direction} onChange={(e) => setDirection(e.target.value)}
              placeholder="How do you want to remix this? e.g. same format, but about saving for a down payment as a newcomer"
              className="min-h-[80px] rounded-xl text-sm"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={startResearch}
              disabled={loading !== null || !topic.trim() || (kind === "video" && !selectedVideo) || (kind === "hook" && !selectedSavedHook)}
              className="h-10 gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 text-white hover:opacity-90"
            >
              {loading === "research" ? <><Loader2 className="h-4 w-4 animate-spin" /> Researching…</> : <>Research this topic <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && research && (
        <div className="space-y-4">
          {!research.topicFit.fits && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>This topic may not fit {persona.name}.</b> {research.topicFit.reason} Staying on your topics helps the algorithm learn who to show you to.{" "}
                <button className="underline" onClick={() => go(1)}>Change topic</button>
              </span>
            </div>
          )}
          <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${
            highStakes
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              : "border-white/[0.08] bg-white/[0.03] text-muted-foreground"
          }`}>
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>AI research can be wrong. Verify facts and numbers before posting.</b>
              {highStakes && " Your niche gives advice people act on with their money, health or legal status, so check every claim against an official source."}
            </span>
          </div>

          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="space-y-1">
              <p className={LABEL}>Summary</p>
              <p className="text-sm leading-relaxed">{research.executiveSummary}</p>
            </div>
            {research.angle && (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                <p className={`${LABEL} flex items-center gap-1.5 text-orange-600 dark:text-orange-300`}><Lightbulb className="h-3 w-3" /> Your non-obvious angle</p>
                <p className="mt-1 text-sm leading-relaxed">{research.angle}</p>
              </div>
            )}
            {research.surprisingFacts.length > 0 && (
              <div className="space-y-2">
                <p className={LABEL}>Surprising facts · verify before posting</p>
                <ul className="space-y-2">
                  {research.surprisingFacts.map((f, i) => (
                    <li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm">
                      {f.fact}
                      {f.sourceHint && <span className="mt-0.5 block text-[11px] text-muted-foreground">Check: {f.sourceHint}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {research.contrastMoments.length > 0 && (
              <div className="space-y-2">
                <p className={LABEL}>Contrast moments</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {research.contrastMoments.map((c, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm">
                      <p className="text-muted-foreground line-through decoration-red-500/60">{c.before}</p>
                      <p className="mt-1 font-medium">→ {c.after}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {research.stepByStep && research.stepByStep.length > 0 && (
              <div className="space-y-2">
                <p className={LABEL}>Step by step</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {research.stepByStep.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 gap-2 rounded-full" onClick={() => go(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button variant="outline" className="h-10 gap-2 rounded-full" disabled={loading !== null || !source} onClick={() => source && runResearch(source)}>
                {loading === "research" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Redo research
              </Button>
            </div>
            <Button
              onClick={() => (hookOptions.length ? go(3) : runHooks())} disabled={loading !== null}
              className="h-10 gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 text-white hover:opacity-90"
            >
              {loading === "hooks" ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing hooks…</> : <>Choose a hook <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            <p className="text-xs text-muted-foreground">
              {usedOutliers
                ? "Each hook borrows the structure of a real high-performing video from your latest keyword search."
                : "No recent keyword search found, so these hooks use proven library structures. Search a keyword first to get hooks inspired by real outliers."}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {hookOptions.map((h, i) => (
                <button
                  key={`${i}-${h.text}`} onClick={() => setChosenHook(h.text)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${chosenHook === h.text ? "border-orange-500/50 bg-orange-500/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"}`}
                >
                  <p className="text-sm font-semibold leading-snug">{h.text}</p>
                  {h.why && <p className="mt-1 text-[11px] text-muted-foreground">{h.why}</p>}
                  {h.inspiredBy ? (
                    <a
                      href={h.inspiredBy.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-300 hover:underline"
                    >
                      Inspired by {h.inspiredBy.creator} · {formatCount(h.inspiredBy.views)} views <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : h.structure ? (
                    <span className="mt-2 inline-block text-[11px] text-muted-foreground">Structure: {h.structure}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" disabled={loading !== null} onClick={() => runHooks(true)}>
              {loading === "more" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Generate more
            </Button>

            <div
              className={`rounded-2xl border p-4 space-y-2 ${chosenHook === "__custom__" ? "border-orange-500/50 bg-orange-500/10" : "border-white/[0.06] bg-white/[0.02]"}`}
              onClick={() => setChosenHook("__custom__")}
            >
              <p className={LABEL}>Write your own hook</p>
              <Input
                value={customHook} placeholder="Type your opening line…" className="h-10 rounded-xl"
                onChange={(e) => {
                  setCustomHook(e.target.value);
                  setChosenHook("__custom__");
                }}
              />
            </div>

            <div className="space-y-1.5">
              <p className={LABEL}>Target length</p>
              <div className="flex gap-2">
                {SCRIPT_LENGTHS.map((s) => (
                  <button
                    key={s} onClick={() => setLengthSec(s)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs ${lengthSec === s ? "border-transparent bg-gradient-to-r from-red-500 to-orange-500 text-white" : "glass border-white/[0.08] text-muted-foreground"}`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="outline" className="h-10 gap-2 rounded-full" onClick={() => go(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button
              onClick={() => runScript("first")} disabled={loading !== null || !finalHook}
              className="h-10 gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-5 text-white hover:opacity-90"
            >
              {loading === "script" ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing script…</> : <>Write my script <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && draft && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs" onClick={() => go(source ? 3 : 4)} disabled={!source}>
              <ArrowLeft className="h-3 w-3" /> Change hook or length
            </Button>
            <span>Hook: <span className="text-foreground">{finalHook}</span></span>
          </div>
          <ScriptEditor
            draft={draft} lengthSec={lengthSec} busy={editBusy} saveState={saveState}
            onChange={(d) => {
              setDraft(d);
              if (saveState === "saved") setSaveState("idle");
            }}
            onRewrite={() => runScript("rewrite")}
            onImprove={improve}
            onSave={save}
          />
        </div>
      )}
    </div>
  );
}
