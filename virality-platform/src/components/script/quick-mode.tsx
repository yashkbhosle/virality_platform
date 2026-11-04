"use client";

import { useState } from "react";
import { FileText, Loader2, Copy, Check, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const DURATIONS = ["30", "45", "60", "90", "120"];
const FORMATS = ["Educational/Value", "Story", "List/Tips", "Tutorial", "Case Study", "Q&A", "Controversial", "Transformation"];

interface QuickScript {
  title: string;
  fullScript: string;
  hook?: string;
  intro?: string;
  body?: string;
  climax?: string;
  cta?: string;
  bRollSuggestions?: string[];
  captionSuggestions?: string[];
  hashtags?: string[];
}

/** The original one-form script writer, kept as "Quick mode". */
export function QuickMode({ initialTopic = "", initialHook = "" }: { initialTopic?: string; initialHook?: string }) {
  const [form, setForm] = useState({
    topic: initialTopic, niche: "Healthcare", hook: initialHook, duration: "60",
    format: "Educational/Value", audience: "", cta: "Follow for more",
  });
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<QuickScript | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("hook");

  const generate = async () => {
    setLoading(true);
    setScript(null);
    setError("");
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || !data.fullScript) throw new Error(data.error);
      setScript(data);
      setExpandedSection("hook");
    } catch (e: unknown) {
      setError((e instanceof Error && e.message) || "Couldn't write the script right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyFull = () => {
    if (!script) return;
    navigator.clipboard.writeText(script.fullScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadScript = () => {
    if (!script) return;
    const content = `TITLE: ${script.title}\n\n${script.fullScript}\n\n---\nB-ROLL IDEAS:\n${script.bRollSuggestions?.join("\n")}\n\nCAPTION IDEAS:\n${script.captionSuggestions?.join("\n")}\n\nHASHTAGS:\n${script.hashtags?.join(" ")}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `script-${form.topic.slice(0, 20)}.txt`; a.click();
  };

  const sections = script ? [
    { key: "hook", label: "🎣 Hook (0-5s)", content: script.hook, color: "orange" },
    { key: "intro", label: "🚀 Intro (5-15s)", content: script.intro, color: "blue" },
    { key: "body", label: "💡 Body (15-50s)", content: script.body, color: "purple" },
    { key: "climax", label: "🔥 Climax (50-55s)", content: script.climax, color: "red" },
    { key: "cta", label: "📣 CTA (55-60s)", content: script.cta, color: "green" },
  ] : [];

  const colorMap: Record<string, string> = {
    orange: "border-orange-500/20 bg-orange-500/5 text-orange-400",
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-400",
    purple: "border-purple-500/20 bg-purple-500/5 text-purple-400",
    red: "border-red-500/20 bg-red-500/5 text-red-400",
    green: "border-green-500/20 bg-green-500/5 text-green-400",
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        {/* Form */}
        <div className="glass rounded-2xl p-6 space-y-4 h-fit">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Script Details</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Topic *</label>
              <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="e.g. 3 signs your liver is in danger..."
                className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Niche</label>
              <Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
                placeholder="e.g. Healthcare, Ayurveda, Fitness..."
                className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Opening Hook (leave blank for AI-generated)</label>
              <Input value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })}
                placeholder="Paste a hook from Hook Generator..."
                className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Target Audience</label>
              <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder="e.g. patients over 35, health-conscious women..."
                className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Duration</label>
              <div className="flex gap-2 flex-wrap">
                {DURATIONS.map((d) => (
                  <button key={d} onClick={() => setForm({ ...form, duration: d })}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${form.duration === d ? "bg-green-500/20 border-green-500/40 text-green-300" : "glass border-white/[0.08] text-muted-foreground"}`}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Format</label>
              <div className="flex gap-2 flex-wrap">
                {FORMATS.map((f) => (
                  <button key={f} onClick={() => setForm({ ...form, format: f })}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${form.format === f ? "bg-green-500/20 border-green-500/40 text-green-300" : "glass border-white/[0.08] text-muted-foreground"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">CTA</label>
              <Input value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })}
                placeholder="e.g. Book a consultation, Follow for more..."
                className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
            </div>
          </div>
          <Button onClick={generate} disabled={loading || !form.topic.trim()}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 border-0 font-semibold gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing script...</> : <><FileText className="h-4 w-4" /> Generate Script</>}
          </Button>
        </div>

        {/* Script output */}
        <div className="space-y-4">
          {error && (
            <div className="glass rounded-2xl p-4 border border-red-500/20 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" className="rounded-full h-8 text-xs" onClick={generate}>Try again</Button>
            </div>
          )}
          {script ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base">{script.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{form.duration}s • {form.format}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={copyFull}
                    className="rounded-xl glass border-white/[0.08] text-xs h-8 gap-1.5">
                    {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                    Copy Script
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadScript}
                    className="rounded-xl glass border-white/[0.08] text-xs h-8 gap-1.5">
                    <Download className="h-3 w-3" /> Download
                  </Button>
                </div>
              </div>

              {/* Script sections accordion */}
              <div className="space-y-2">
                {sections.map(({ key, label, content, color }) => (
                  <div key={key} className={`rounded-2xl border overflow-hidden ${colorMap[color]}`}>
                    <button className="w-full flex items-center justify-between p-4"
                      onClick={() => setExpandedSection(expandedSection === key ? null : key)}>
                      <span className="text-sm font-semibold">{label}</span>
                      {expandedSection === key ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSection === key && (
                      <div className="px-4 pb-4">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{content}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Extras */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="glass rounded-2xl p-4 border border-white/[0.06] space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🎬 B-Roll Ideas</p>
                  {script.bRollSuggestions?.map((b: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">• {b}</p>
                  ))}
                </div>
                <div className="glass rounded-2xl p-4 border border-white/[0.06] space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"># Hashtags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {script.hashtags?.map((h: string) => (
                      <Badge key={h} variant="secondary" className="text-[10px] rounded-md bg-white/[0.05] border border-white/[0.06]">{h}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="glass rounded-2xl p-8 sm:p-16 text-center h-full flex flex-col items-center justify-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
              <h3 className="font-semibold text-lg">Your script will appear here</h3>
              <p className="text-sm text-muted-foreground mt-1">Fill in the details and generate a complete ready-to-record script</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
