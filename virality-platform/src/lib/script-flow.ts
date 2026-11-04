// F5: Guided script flow — shared types and normalizers (client + server safe).
import type { HookFormula, ShotStep, ViralAnalysis, VisualPlaybook } from "./analysis-prompt";
import { normalizeShotList } from "./analysis-prompt";

export const SCRIPT_COLLECTION = "scripts";
export const SCRIPT_LENGTHS = [15, 30, 45, 60] as const;
export type ScriptLength = (typeof SCRIPT_LENGTHS)[number];
export const WORDS_PER_SECOND = 2.5;

/** What the script is based on (Step 1). */
export interface ScriptSource {
  kind: "video" | "hook" | "topic";
  topic: string;
  direction?: string;
  video?: {
    url: string;
    title: string;
    creator?: string;
    views?: number;
    platform: "youtube" | "instagram";
    hook?: string;
    whyViral?: string;
    hookFormula?: HookFormula;
    visualPlaybook?: VisualPlaybook;
    contentFormat?: string;
  };
  savedHook?: { template: string; structureName: string };
}

export interface Research {
  executiveSummary: string;
  surprisingFacts: { fact: string; sourceHint: string }[];
  contrastMoments: { before: string; after: string }[];
  stepByStep?: string[];
  angle: string;
  topicFit: { fits: boolean; reason: string };
}

/** A real high-performing video used to inspire hook options. */
export interface Outlier {
  title: string;
  creator: string;
  views: number;
  url: string;
  hook?: string;
}

export interface HookOption {
  text: string;
  why: string;
  inspiredBy?: { creator: string; views: number; url: string };
  structure?: string;
}

export interface ScriptBeat {
  time: string;
  line: string;
  visual: string;
  onScreenText?: string;
}

export interface ScriptDraft {
  title: string;
  fullScript: string;
  beats: ScriptBeat[];
  cta: string;
  shotList: ShotStep[];
  caption: string;
  wordCount: number;
  estSeconds: number;
}

export interface SavedScript {
  id: string;
  personaId: string;
  title: string;
  sourceVideoUrl?: string;
  source?: ScriptSource;
  hook: string;
  research?: Research;
  script: ScriptDraft;
  lengthSec?: number;
  createdAt: string;
  updatedAt?: string;
}

// ── helpers ──────────────────────────────────────────────────────────

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function strList(v: unknown, max = 10, len = 400): string[] {
  return (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, max);
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
export function estimateSeconds(words: number): number {
  return Math.round(words / WORDS_PER_SECOND);
}

/** Finance, insurance, legal and health niches get a stronger "verify facts" warning. */
export function isHighStakesNiche(text: string): boolean {
  return /financ|money|invest|mortgage|loan|credit|tax|insur|legal|law|lawyer|immigra|visa|health|medic|doctor|clinic|dental|dentist|nutrition|diet|supplement|fitness|therap|mental|pharma|ivf|fertility/i.test(text);
}

export function analysisToVideoSource(
  meta: { url: string; title: string; creator?: string; views?: number; platform: "youtube" | "instagram" },
  a: ViralAnalysis
): NonNullable<ScriptSource["video"]> {
  return {
    ...meta,
    hook: a.hook,
    whyViral: a.whyViral,
    hookFormula: a.hookFormula,
    visualPlaybook: a.visualPlaybook,
    contentFormat: a.contentFormat,
  };
}

/** Plain-text block describing the source for prompts. */
export function sourceToPromptBlock(s: ScriptSource): string {
  const lines = [`TOPIC: ${s.topic}`];
  if (s.direction) lines.push(`CREATOR'S DIRECTION (how they want to remix it): ${s.direction}`);
  if (s.video) {
    const v = s.video;
    lines.push(
      `SOURCE VIDEO (a real viral ${v.platform === "youtube" ? "YouTube Short" : "Instagram Reel"}): "${v.title}"${v.creator ? ` by ${v.creator}` : ""}${v.views ? `, ${v.views.toLocaleString("en-US")} views` : ""}`
    );
    if (v.hook) lines.push(`- Its hook: ${v.hook}`);
    if (v.hookFormula) lines.push(`- Hook formula: "${v.hookFormula.template}" (${v.hookFormula.structure})`);
    if (v.whyViral) lines.push(`- Why it went viral: ${v.whyViral}`);
    if (v.contentFormat) lines.push(`- Structure: ${v.contentFormat}`);
    if (v.visualPlaybook) {
      const p = v.visualPlaybook;
      lines.push(`- How it was filmed: ${[p.camera, p.setting, p.editing, p.onScreenText].filter(Boolean).join(" | ")}`);
    }
  }
  if (s.savedHook) lines.push(`SAVED HOOK FORMULA TO USE: "${s.savedHook.template}" (${s.savedHook.structureName})`);
  return lines.join("\n");
}

export function researchToPromptBlock(r?: Research | null): string {
  if (!r) return "";
  return [
    `RESEARCH SUMMARY: ${r.executiveSummary}`,
    r.angle && `NON-OBVIOUS ANGLE: ${r.angle}`,
    r.surprisingFacts.length && `FACTS (unverified — keep wording cautious, never add new numbers):\n${r.surprisingFacts.map((f) => `- ${f.fact}`).join("\n")}`,
    r.contrastMoments.length && `CONTRAST MOMENTS:\n${r.contrastMoments.map((c) => `- ${c.before} → ${c.after}`).join("\n")}`,
    r.stepByStep?.length && `STEPS:\n${r.stepByStep.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const ENGAGEMENT_RULES = `THE 4 ENGAGEMENT RULES (every line must pass them):
1. Relevant: speaks to this audience's real pain or desire.
2. Non-obvious: says something they don't already know or believe.
3. Easy to absorb: short sentences, plain words, one thought per line.
4. Short distance: the payoff comes fast; no long wind-up.
ONE IDEA PER VIDEO: pick the single strongest idea and cut everything else.`;

// ── normalizers ──────────────────────────────────────────────────────

export function normalizeResearch(raw: unknown): Research {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const facts = (Array.isArray(r.surprisingFacts) ? r.surprisingFacts : [])
    .map((f) => {
      if (typeof f === "string") return { fact: str(f, 400), sourceHint: "" };
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      return { fact: str(o.fact ?? o.text, 400), sourceHint: str(o.sourceHint ?? o.source, 200) };
    })
    .filter((f) => f.fact)
    .slice(0, 5);
  const contrast = (Array.isArray(r.contrastMoments) ? r.contrastMoments : [])
    .map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { before: str(o.before, 300), after: str(o.after, 300) };
    })
    .filter((c) => c.before && c.after)
    .slice(0, 5);
  const fit = (r.topicFit && typeof r.topicFit === "object" ? r.topicFit : {}) as Record<string, unknown>;
  const steps = strList(r.stepByStep, 8);
  return {
    executiveSummary: str(r.executiveSummary, 1200),
    surprisingFacts: facts,
    contrastMoments: contrast,
    ...(steps.length ? { stepByStep: steps } : {}),
    angle: str(r.angle, 500),
    topicFit: { fits: fit.fits !== false, reason: str(fit.reason, 300) },
  };
}

export function normalizeDraft(raw: unknown): ScriptDraft {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const beats = (Array.isArray(r.beats) ? r.beats : [])
    .map((b) => {
      const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      const onScreenText = str(o.onScreenText, 200);
      return { time: str(o.time, 20), line: str(o.line, 600), visual: str(o.visual, 300), ...(onScreenText ? { onScreenText } : {}) };
    })
    .filter((b) => b.line)
    .slice(0, 20);
  const fullScript = str(r.fullScript, 6000) || beats.map((b) => b.line).join("\n");
  const wordCount = countWords(fullScript);
  return {
    title: str(r.title, 200) || "Untitled script",
    fullScript,
    beats,
    cta: str(r.cta, 400),
    shotList: normalizeShotList(r.shotList),
    caption: str(r.caption, 2200),
    // Count ourselves rather than trusting the model's numbers.
    wordCount,
    estSeconds: estimateSeconds(wordCount),
  };
}

export function normalizeHookOptions(raw: unknown, outliers: Outlier[]): HookOption[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { hooks?: unknown })?.hooks) ? (raw as { hooks: unknown[] }).hooks : [];
  return list
    .map((h) => {
      const o = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
      const idx = Number(o.inspiredByIndex);
      const src = Number.isInteger(idx) && idx >= 1 && idx <= outliers.length ? outliers[idx - 1] : undefined;
      const structure = str(o.structure, 80);
      return {
        text: str(o.text, 240),
        why: str(o.why, 300),
        ...(src ? { inspiredBy: { creator: src.creator, views: src.views, url: src.url } } : {}),
        ...(structure ? { structure } : {}),
      };
    })
    .filter((h) => h.text)
    .slice(0, 6);
}

export const SCRIPT_JSON_SHAPE = `{
  "title": "short working title",
  "fullScript": "spoken words only, one short line per sentence, separated by \\n",
  "beats": [{"time": "0-3s", "line": "what is said", "visual": "what the viewer sees", "onScreenText": "optional overlay text"}],
  "cta": "closing call to action",
  "shotList": [{"step": 1, "shot": "what to film", "durationSec": 3, "tip": "beginner tip"}],
  "caption": "post caption with 3-5 relevant hashtags at the end"
}`;
