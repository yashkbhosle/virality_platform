"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Loader2, Copy, Check, RefreshCw, UserRound } from "lucide-react";
import { usePersonas } from "@/lib/use-personas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const HOOK_STYLES = ["engaging", "educational", "controversial", "story", "data-driven"];
const NICHES = ["Healthcare/Medical", "Ayurveda", "Fitness", "Business/Finance", "Personal Development", "Tech", "Food", "Travel", "Real Estate", "Other"];

const TYPE_COLORS: Record<string, string> = {
  Question: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Shock: "text-red-400 bg-red-500/10 border-red-500/20",
  Story: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  Promise: "text-green-400 bg-green-500/10 border-green-500/20",
  Controversy: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  Statistics: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  Challenge: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  Curiosity: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  Fear: "text-red-400 bg-red-500/10 border-red-500/20",
  "Social Proof": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

interface GeneratedHook {
  text: string;
  type: string;
  why: string;
  structureId?: string;
}

export default function HookGeneratorPage() {
  const { active, personas } = usePersonas();
  const [error, setError] = useState("");
  const [form, setForm] = useState({ topic: "", niche: "Healthcare/Medical", style: "engaging", reference: "" });
  const [loading, setLoading] = useState(false);
  const [hooks, setHooks] = useState<GeneratedHook[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const generate = async () => {
    setLoading(true);
    setHooks([]);
    setError("");
    try {
      const res = await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, personaId: active?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error);
      setHooks(data.hooks || []);
    } catch (e: unknown) {
      setError((e instanceof Error && e.message) || "Couldn't generate hooks right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleSelect = (text: string) => {
    setSelected((prev) => prev.includes(text) ? prev.filter((s) => s !== text) : [...prev, text]);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500">
            <Zap className="h-5 w-5 text-white" />
          </span>
          Hook Generator
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Generate 15 viral hooks in seconds using proven frameworks</p>
      </div>

      {personas !== null && (
        active ? (
          <div className="glass rounded-2xl px-4 py-3 text-sm flex flex-wrap items-center gap-2 border border-orange-500/20">
            <UserRound className="h-4 w-4 text-orange-600 dark:text-orange-300" />
            <span>Writing as <b>{active.name}</b>: 3 hooks from each of the 5 library structures that fit this persona.</span>
          </div>
        ) : (
          <div className="glass rounded-2xl px-4 py-3 text-sm flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">No persona selected, so hooks will be generic.</span>
            <Link href="/persona" className="font-semibold text-orange-600 dark:text-orange-300 hover:underline">
              {personas.length ? "Pick a persona" : "Create a persona"} →
            </Link>
          </div>
        )
      )}


      {/* Form */}
      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Topic *</label>
            <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="e.g. Why most IVF cycles fail, Cirrhosis reversal..."
              className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
          </div>
          {!active && <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Niche</label>
            <select value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
              className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 text-sm text-foreground">
              {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Hook Style</label>
            <div className="flex flex-wrap gap-2">
              {HOOK_STYLES.map((s) => (
                <button key={s} onClick={() => setForm({ ...form, style: s })}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${form.style === s ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300" : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Reference Video Title (optional)</label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Paste a viral video title for inspiration"
              className="rounded-xl glass border-white/[0.08] h-11 text-sm" />
          </div>
        </div>
        <Button onClick={generate} disabled={loading || !form.topic.trim()}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 border-0 font-semibold gap-2 text-black">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating 15 hooks...</> : <><Zap className="h-4 w-4" /> Generate Hooks</>}
        </Button>
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/20 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" className="rounded-full h-8 text-xs" onClick={generate}>Try again</Button>
        </div>
      )}

      {/* Selected hooks export */}
      {selected.length > 0 && (
        <div className="glass rounded-2xl p-4 border border-yellow-500/20 flex items-center justify-between">
          <p className="text-sm">{selected.length} hooks selected</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="rounded-xl text-xs h-8 gap-1.5"
              onClick={() => {
                navigator.clipboard.writeText(selected.join("\n\n"));
                setCopied("all");
                setTimeout(() => setCopied(null), 2000);
              }}>
              {copied === "all" ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
              Copy All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}
              className="rounded-xl text-xs h-8 text-muted-foreground">Clear</Button>
          </div>
        </div>
      )}

      {/* Hooks grid */}
      {hooks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{hooks.length} Hooks Generated</p>
            <Button variant="ghost" size="sm" onClick={generate} disabled={loading}
              className="rounded-xl text-xs h-8 gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> Regenerate
            </Button>
          </div>
          <div className="grid gap-3">
            {hooks.map((hook, i) => {
              const colorClass = TYPE_COLORS[hook.type] || "text-muted-foreground bg-white/[0.03] border-white/[0.06]";
              const isSelected = selected.includes(hook.text);
              return (
                <div key={i}
                  className={`group glass rounded-2xl p-4 border transition-all duration-200 cursor-pointer hover:border-white/[0.12] ${isSelected ? "border-yellow-500/30 bg-yellow-500/5" : ""}`}
                  onClick={() => toggleSelect(hook.text)}>
                  <div className="flex items-start gap-3">
                    <div className={`h-5 w-5 rounded-md border-2 shrink-0 mt-0.5 transition-all ${isSelected ? "bg-yellow-500 border-yellow-500" : "border-white/[0.2]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-black text-muted-foreground/40">#{i + 1}</span>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 rounded-md border ${colorClass}`}>
                          {hook.type}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold leading-relaxed">{hook.text}</p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{hook.why}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); copy(hook.text, i.toString()); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/[0.06]">
                      {copied === i.toString() ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && hooks.length === 0 && (
        <div className="glass rounded-2xl p-8 sm:p-16 text-center">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
          <h3 className="font-semibold text-lg">Generate your first hooks</h3>
          <p className="text-sm text-muted-foreground mt-1">Enter a topic and get 15 battle-tested hook frameworks instantly</p>
        </div>
      )}
    </div>
  );
}
