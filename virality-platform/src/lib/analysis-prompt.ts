// Shared "why it went viral" analysis prompt for YouTube Shorts and Instagram Reels.
//
// The framework:
//   1. The algorithm is a matchmaker: it tests a video on ~200 best-fit strangers,
//      then boosts, retries, or stops based on how they react.
//   2. Lever 1 — fit score: one audience avatar + narrow topics.
//   3. Lever 2 — engagement: watch time, engagement rate, session share, driven by
//      four content rules (relevant, non-obvious, easy to absorb, short distance to result).
//   4. Comments are driven by: hard stance, contrarian take, amplified framing,
//      familiar targets (brands/people with existing opinions), strong emotion.
//   5. Posting time, hashtags and caption tweaks are icing — the video is the cake.

import {
  computeViralityMetrics,
  describeMetricsForPrompt,
  type ViralityMetrics,
} from "./virality";
import { DEFAULT_HOOKS } from "./hook-library";

export interface FrameworkScore {
  score: number; // 1–10
  note: string;
}

export interface ViralAnalysis {
  // Original fields (kept for backwards compatibility with existing UI/CSV)
  hook: string;
  format: string;
  whyViral: string;
  keyTopics: string[];
  contentFormat: string;
  hookType: string;
  cta: string;
  // Framework fields
  reachAssessment?: "organic" | "likely paid" | "unclear";
  reachReason?: string;
  targetAvatar?: string;
  hookStrength?: FrameworkScore;
  engagementRules?: {
    relevance: FrameworkScore;
    nonObvious: FrameworkScore;
    absorption: FrameworkScore;
    shortDistance: FrameworkScore;
  };
  commentTriggers?: string[];
  retentionTactics?: string[];
  replicate?: string[];
  // F3: reusable hook template
  hookFormula?: HookFormula;
  // F4: how it was filmed + phone-only shot list
  visualPlaybook?: VisualPlaybook;
}

export interface HookFormula {
  template: string; // "Don't [risky action] without [protective thing] — here's what happened to me"
  structure: string; // e.g. "Warning + personal stakes"
  libraryId?: string; // id of the matching DEFAULT_HOOKS structure, if any
  variables: { name: string; example: string }[];
}

export interface ShotStep {
  step: number;
  shot: string;
  durationSec: number;
  tip: string;
}

export interface VisualPlaybook {
  camera: string;
  setting: string;
  bRoll: string[];
  onScreenText: string;
  editing: string;
  audio: string;
  colorAndLighting: string;
  lengthSeconds?: number;
  beginnerShotList: ShotStep[];
  /** True when the model could not watch the video (Instagram) and inferred the visuals. */
  inferred?: boolean;
}

export interface PromptContext {
  platform: "YouTube Short" | "Instagram Reel";
  title?: string;
  caption?: string;
  creator?: string;
  views: number;
  likes: number;
  comments: number;
  metrics?: ViralityMetrics | null;
  transcript?: string;
  /** true when the model can watch the video itself (YouTube via Gemini fileData) */
  hasVideo: boolean;
  /** ask the model to also return a word-for-word transcript */
  includeTranscript: boolean;
}

export function resolveMetrics(ctx: Pick<PromptContext, "views" | "likes" | "comments" | "metrics">) {
  if (ctx.metrics) return ctx.metrics;
  if (ctx.views > 0) return computeViralityMetrics({ views: ctx.views, likes: ctx.likes, comments: ctx.comments });
  return null;
}

export function buildViralAnalysisPrompt(ctx: PromptContext): string {
  const metrics = resolveMetrics(ctx);
  const metricsBlock = metrics
    ? describeMetricsForPrompt(metrics, ctx.views)
    : `Likes: ${ctx.likes.toLocaleString()} | Comments: ${ctx.comments.toLocaleString()} (view count unavailable)`;

  const source = ctx.hasVideo
    ? "Watch the full video."
    : ctx.transcript && ctx.transcript.length > 20
      ? `Audio transcript:\n"""\n${ctx.transcript.slice(0, 5000)}\n"""`
      : "(No video or transcript available — analyze from the caption and metrics only, and say so.)";

  const paidRule = metrics?.likelyPaid
    ? `\nIMPORTANT: The numbers indicate this reach was most likely PAID (ad impressions), not earned. ` +
      `Set reachAssessment to "likely paid". Begin whyViral with "Reach appears to be paid, not organic." ` +
      `Then assess the content on its own merits — do NOT invent reasons it "went viral".\n`
    : "";

  return `You are an expert short-form content strategist. Analyze this ${ctx.platform} using the framework below.

FRAMEWORK
- The algorithm is a matchmaker. It first shows a video to ~200 best-fit strangers, then boosts, retries or stops based on their reaction.
- Lever 1 (fit score): the clearer the single audience avatar and the narrower the topic, the better the test group.
- Lever 2 (engagement): watch time/completion, engagement rate, and session share. Driven by four rules:
  1. Relevance — solves a core pain point or problem the viewer has
  2. Non-obvious — new information, or familiar information explained in a new way
  3. Absorption — easy to understand and take in
  4. Short distance — a small action the viewer can take alone for a big result
- Comments are driven by: hard stance, contrarian take, amplified framing, familiar targets (brands/people/ideas people already have opinions on), strong emotion.
- Engagement quality matters more than raw views. Organic viral Shorts/Reels usually get 2–10% likes per view; ads often get under 0.05%.

VIDEO
${ctx.creator ? `Creator: ${ctx.creator}\n` : ""}${ctx.title ? `Title: "${ctx.title}"\n` : ""}${ctx.caption ? `Caption: "${ctx.caption.slice(0, 1000)}"\n` : ""}
PERFORMANCE DATA
${metricsBlock}
${paidRule}
${source}

Return ONLY valid JSON (no markdown fences, no extra text) in exactly this shape:
{
  ${ctx.includeTranscript ? `"transcript": "Complete word-for-word transcript of everything spoken",\n  ` : ""}"hook": "The exact opening hook — what is said or shown in the first 3 seconds",
  "hookType": "Hook category (Question, Bold Claim, Contrarian, Shock, Story, Statistic, Visual, Warning/Mistake, etc.)",
  "hookStrength": {"score": 1-10, "note": "Why the first 3 seconds do or don't stop the scroll"},
  "format": "Content format (Tutorial, Talking Head, Storytime, List, POV, Skit, Before/After, etc.)",
  "contentFormat": "Structure breakdown: intro → middle → end, with approximate timings if known",
  "targetAvatar": "The single, specific viewer this is made for (who they are and what they want)",
  "reachAssessment": "organic" | "likely paid" | "unclear",
  "reachReason": "One sentence grounded in the performance data",
  "whyViral": "3-4 specific sentences on why it performed (or, if paid, what the content does well/poorly). Reference the framework.",
  "engagementRules": {
    "relevance": {"score": 1-10, "note": "..."},
    "nonObvious": {"score": 1-10, "note": "..."},
    "absorption": {"score": 1-10, "note": "..."},
    "shortDistance": {"score": 1-10, "note": "..."}
  },
  "commentTriggers": ["Which of the 5 comment triggers are used, each with a short note — empty array if none"],
  "retentionTactics": ["Specific techniques that keep people watching (pattern interrupts, open loops, pacing, on-screen text, etc.)"],
  "keyTopics": ["topic1", "topic2", "topic3"],
  "cta": "Call to action at the end, or 'None detected'",
  "replicate": ["3 concrete, actionable steps to adapt this video's winning elements for a different account in the same niche"],
  "hookFormula": {
    "template": "The opening line as a reusable template with [bracketed variables]",
    "structure": "Short name of the hook structure, e.g. 'Warning + personal stakes'",
    "libraryId": "id of the closest library structure below, or null if none fits",
    "variables": [{"name": "variable name exactly as written inside the brackets", "example": "what it was in this video"}]
  },
  "visualPlaybook": {
    "camera": "Framing, angle, distance, eye contact, handheld vs tripod",
    "setting": "Location, background, props",
    "bRoll": ["Specific cutaway shots"],
    "onScreenText": "Caption style, keyword highlights, position on screen",
    "editing": "Cut frequency, zooms, transitions, pacing (e.g. cuts every ~2 sec)",
    "audio": "Voice style, music, sound effects",
    "colorAndLighting": "Lighting setup and colour look",
    "lengthSeconds": number or null,
    "beginnerShotList": [{"step": 1, "shot": "What to film", "durationSec": 3, "tip": "How to do it with a phone"}]
  }
}

HOOK FORMULA RULES
- Turn the exact opening line into a reusable template by replacing the specific nouns, numbers and outcomes with [bracketed variables]. Keep the rhythm and emotional trigger identical.
- Use 2–4 variables. Every [variable] in the template must appear in "variables" with the same name, and its example must be the original words from this video.
- Map to the closest library structure if one fits (use its id), otherwise set libraryId to null:
${HOOK_LIBRARY_LIST}

VISUAL PLAYBOOK RULES
- ${ctx.hasVideo
    ? "You can watch the video: describe what you SEE (actual framing, real cut timing, the exact on-screen text style)."
    : "You cannot see the video (caption/transcript only): infer carefully and write 'likely' wherever you are unsure."}
- beginnerShotList must have 4–8 steps that are filmable with just a phone and natural light, in shooting order, with realistic durations that add up to roughly the video length.`;
}

const HOOK_LIBRARY_LIST = DEFAULT_HOOKS.map((h) => `  - ${h.id}: ${h.name} ("${h.template}")`).join("\n");

// ── Normalisers for model output (keep the UI safe from malformed fields) ──

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown, max = 12): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : [];
}

export function normalizeHookFormula(v: unknown): HookFormula | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const template = str(r.template);
  if (!template) return undefined;
  const libraryId = str(r.libraryId);
  const variables = (Array.isArray(r.variables) ? r.variables : [])
    .map((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return { name: str(o.name).replace(/^\[|\]$/g, ""), example: str(o.example) };
    })
    .filter((x) => x.name)
    .slice(0, 6);
  // Add any [variable] in the template the model forgot to list.
  for (const m of template.matchAll(/\[([^\]]+)\]/g)) {
    if (!variables.some((x) => x.name.toLowerCase() === m[1].toLowerCase())) variables.push({ name: m[1], example: "" });
  }
  return {
    template,
    structure: str(r.structure),
    libraryId: DEFAULT_HOOKS.some((h) => h.id === libraryId) ? libraryId : undefined,
    variables,
  };
}

export function normalizeShotList(v: unknown): ShotStep[] {
  return (Array.isArray(v) ? v : [])
    .map((x, i) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const d = Number(o.durationSec);
      return { step: i + 1, shot: str(o.shot), durationSec: Number.isFinite(d) && d > 0 ? Math.round(d) : 0, tip: str(o.tip) };
    })
    .filter((s) => s.shot)
    .slice(0, 10);
}

export function normalizeVisualPlaybook(v: unknown): VisualPlaybook | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const len = Number(r.lengthSeconds);
  const pb: VisualPlaybook = {
    camera: str(r.camera),
    setting: str(r.setting),
    bRoll: strList(r.bRoll),
    onScreenText: str(r.onScreenText),
    editing: str(r.editing),
    audio: str(r.audio),
    colorAndLighting: str(r.colorAndLighting),
    lengthSeconds: Number.isFinite(len) && len > 0 ? Math.round(len) : undefined,
    beginnerShotList: normalizeShotList(r.beginnerShotList),
  };
  const hasContent = pb.camera || pb.setting || pb.editing || pb.beginnerShotList.length;
  return hasContent ? pb : undefined;
}

/** Normalise the optional F3/F4 fields on a parsed analysis in place. */
export function normalizeExtras<T extends ViralAnalysis>(a: T): T {
  const raw = a as unknown as Record<string, unknown>;
  a.hookFormula = normalizeHookFormula(raw.hookFormula);
  a.visualPlaybook = normalizeVisualPlaybook(raw.visualPlaybook);
  return a;
}

export function parseViralAnalysis(raw: string): ViralAnalysis & { transcript?: string } {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return normalizeExtras(JSON.parse(cleaned));
  } catch {
    // Try to salvage the first JSON object in the text
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return normalizeExtras(JSON.parse(cleaned.slice(start, end + 1))); } catch { /* fall through */ }
    }
    return {
      hook: "Could not parse",
      format: "Unknown",
      whyViral: raw,
      keyTopics: [],
      contentFormat: "",
      hookType: "Unknown",
      cta: "Unknown",
    };
  }
}
