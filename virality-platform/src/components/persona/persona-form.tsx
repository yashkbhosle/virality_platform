"use client";

import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Mic, Save, Target, Users, MessageSquare, Share2, Briefcase, RotateCcw,
} from "lucide-react";
import { ChipListField } from "@/components/persona/chip-list-field";
import { PLATFORMS, topicsTooBroad, validatePersonaDraft, type PersonaDraft, MAX_FOCUSED_TOPICS } from "@/lib/persona";
import type { Persona, PersonaPlatform } from "@/lib/types";

const SAMPLE_SEPARATOR = "\n\n---\n\n";
const LANGUAGE_SUGGESTIONS = ["English", "Hinglish", "Hindi", "Marathi", "Punjabi", "Gujarati", "Tamil", "Spanish", "French"];
const PLATFORM_LABELS: Record<PersonaPlatform, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 text-sm outline-none focus:border-violet-500/50";

function Section({ icon: Icon, title, hint, children }: { icon: typeof Users; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" /> {title}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

interface PersonaFormProps {
  initial: PersonaDraft;
  personaId?: string;
  onSaved: (persona: Persona) => void;
  onCancel: () => void;
}

export function PersonaForm({ initial, personaId, onSaved, onCancel }: PersonaFormProps) {
  const [draft, setDraft] = useState<PersonaDraft>(initial);
  const [samples, setSamples] = useState<string[]>(() => {
    const parts = (initial.voice.sampleScript ?? "").split(SAMPLE_SEPARATOR).filter(Boolean);
    return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""];
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<{ loading: boolean; error?: string; done?: boolean }>({ loading: false });
  const [focus, setFocus] = useState<{ loading: boolean; error?: string; focused?: boolean; reason?: string; offTopic: string[] }>({
    loading: false,
    offTopic: [],
  });

  const set = <K extends keyof PersonaDraft>(key: K, value: PersonaDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setAvatar = <K extends keyof PersonaDraft["avatar"]>(key: K, value: PersonaDraft["avatar"][K]) =>
    setDraft((d) => ({ ...d, avatar: { ...d.avatar, [key]: value } }));
  const setVoice = <K extends keyof PersonaDraft["voice"]>(key: K, value: PersonaDraft["voice"][K]) =>
    setDraft((d) => ({ ...d, voice: { ...d.voice, [key]: value } }));

  const filledSamples = samples.map((s) => s.trim()).filter(Boolean);
  const tooBroad = topicsTooBroad(draft.topics);

  const learnVoice = async () => {
    setVoiceState({ loading: true });
    try {
      const res = await fetch("/api/personas/voice-from-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: filledSamples }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't read your voice right now. Please try again.");
      setDraft((d) => ({
        ...d,
        voice: {
          ...d.voice,
          tone: data.tone || d.voice.tone,
          phrasesToUse: Array.from(new Set([...d.voice.phrasesToUse, ...(data.phrasesToUse ?? [])])),
          phrasesToAvoid: Array.from(new Set([...d.voice.phrasesToAvoid, ...(data.phrasesToAvoid ?? [])])),
        },
      }));
      setVoiceState({ loading: false, done: true });
    } catch (e) {
      setVoiceState({ loading: false, error: e instanceof Error ? e.message : "Something went wrong. Please try again." });
    }
  };

  const checkFocus = async () => {
    setFocus({ loading: true, offTopic: [] });
    try {
      const res = await fetch("/api/personas/check-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarWho: draft.avatar.who, topics: draft.topics }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "We couldn't check your topics right now. Please try again.");
      setFocus({ loading: false, focused: data.focused, reason: data.reason, offTopic: data.offTopic ?? [] });
    } catch (e) {
      setFocus({ loading: false, offTopic: [], error: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  const save = async () => {
    const full: PersonaDraft = { ...draft, voice: { ...draft.voice, sampleScript: filledSamples.join(SAMPLE_SEPARATOR) } };
    const errors = validatePersonaDraft(full);
    if (errors.length) {
      setSaveError(errors.join(" "));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(personaId ? `/api/personas/${personaId}` : "/api/personas", {
        method: personaId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(full),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.persona) throw new Error(data.error || "Couldn't save this persona. Please try again.");
      onSaved(data.persona as Persona);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save this persona. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const togglePlatform = (p: PersonaPlatform) => {
    const has = draft.platforms.includes(p);
    if (has && draft.platforms.length === 1) return; // keep at least one
    set("platforms", has ? draft.platforms.filter((x) => x !== p) : [...draft.platforms, p]);
  };

  return (
    <div className="space-y-4">
      <Section icon={Briefcase} title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Persona name *">
            <input value={draft.name} onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Yash – AI Growth Consultant" className={`${inputCls} h-10`} />
          </Field>
          <Field label="Offer / call to action">
            <input value={draft.offer ?? ""} onChange={(e) => set("offer", e.target.value)}
              placeholder="e.g. Book a free 15-min call" className={`${inputCls} h-10`} />
          </Field>
        </div>
        <Field label="Niche *">
          <input value={draft.niche} onChange={(e) => set("niche", e.target.value)}
            placeholder="e.g. Insurance tips for new immigrants in Canada" className={`${inputCls} h-10`} />
        </Field>
      </Section>

      <Section icon={Users} title="Your one viewer" hint="Talk to one specific person. The algorithm rewards content that clearly fits one audience.">
        <Field label="Who are they? *">
          <textarea value={draft.avatar.who} onChange={(e) => setAvatar("who", e.target.value)} rows={2}
            placeholder="e.g. First-year newcomers in the GTA, 25–35, just started their first job"
            className={`${inputCls} resize-none py-2`} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChipListField label="Pain points" hint="aim for 3–5" values={draft.avatar.painPoints}
            onChange={(v) => setAvatar("painPoints", v)} placeholder="What keeps them up at night?" tone="negative" />
          <ChipListField label="Desires" hint="aim for 3–5" values={draft.avatar.desires}
            onChange={(v) => setAvatar("desires", v)} placeholder="What do they want?" tone="positive" />
        </div>
        <ChipListField label="Objections (optional)" values={draft.avatar.objections}
          onChange={(v) => setAvatar("objections", v)} placeholder="Why might they not trust you yet?" />
      </Section>

      <Section icon={Target} title="Topics" hint={`3–${MAX_FOCUSED_TOPICS} narrow content pillars, all for the same viewer.`}>
        <ChipListField label="Content pillars *" hint={`${draft.topics.length} topic${draft.topics.length === 1 ? "" : "s"}`}
          values={draft.topics} onChange={(v) => { set("topics", v); setFocus({ loading: false, offTopic: [] }); }}
          placeholder="e.g. First-home down payment tricks" flagged={focus.offTopic} />

        {(tooBroad || focus.focused === false) && (
          <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Narrow topics help the algorithm find the right test audience.</p>
              {tooBroad && <p className="mt-0.5">You have {draft.topics.length} topics. Try keeping it to {MAX_FOCUSED_TOPICS} or fewer.</p>}
              {focus.focused === false && focus.reason && <p className="mt-0.5">{focus.reason}</p>}
              {focus.offTopic.length > 0 && <p className="mt-0.5">Highlighted topics may attract a different viewer.</p>}
            </div>
          </div>
        )}
        {focus.focused === true && !tooBroad && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> All topics fit the same viewer.
          </p>
        )}
        {focus.error && <p className="text-xs text-rose-600 dark:text-rose-300">{focus.error}</p>}
        <button type="button" onClick={checkFocus} disabled={focus.loading || !draft.avatar.who.trim() || draft.topics.length === 0}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
          {focus.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
          Check topic focus
        </button>
      </Section>

      <Section icon={MessageSquare} title="Your voice" hint="So hooks and scripts sound like you, not like AI.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tone">
            <input value={draft.voice.tone} onChange={(e) => setVoice("tone", e.target.value)}
              placeholder="e.g. friendly, direct, slightly funny" className={`${inputCls} h-10`} />
          </Field>
          <Field label="Language">
            <input value={draft.voice.language} onChange={(e) => setVoice("language", e.target.value)} list="persona-languages"
              placeholder="English" className={`${inputCls} h-10`} />
            <datalist id="persona-languages">
              {LANGUAGE_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
            </datalist>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChipListField label="Phrases to use" values={draft.voice.phrasesToUse}
            onChange={(v) => setVoice("phrasesToUse", v)} placeholder="e.g. Here's the thing" tone="positive" />
          <ChipListField label="Phrases to avoid" values={draft.voice.phrasesToAvoid}
            onChange={(v) => setVoice("phrasesToAvoid", v)} placeholder="e.g. Game-changer" tone="negative" />
        </div>

        <div className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-xs font-medium">Paste 1–3 of your past scripts or captions</p>
          {samples.map((s, i) => (
            <textarea key={i} value={s} rows={3}
              onChange={(e) => setSamples((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Sample ${i + 1}${i === 0 ? "" : " (optional)"}`}
              className={`${inputCls} resize-y py-2 text-xs`} />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={learnVoice} disabled={voiceState.loading || filledSamples.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {voiceState.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
              Learn my voice
            </button>
            {voiceState.done && (
              <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Tone and phrases updated. Review them above.
              </span>
            )}
            {voiceState.error && (
              <span className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300">
                {voiceState.error}
                <button type="button" onClick={learnVoice} className="inline-flex items-center gap-1 underline">
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section icon={Share2} title="Platforms">
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = draft.platforms.includes(p);
            return (
              <button key={p} type="button" onClick={() => togglePlatform(p)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  on ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-200" : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                {PLATFORM_LABELS[p]}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {draft.platforms.map((p) => (
            <Field key={p} label={`${PLATFORM_LABELS[p]} handle`}>
              <input value={draft.handles?.[p] ?? ""} placeholder="@yourhandle"
                onChange={(e) => set("handles", { ...draft.handles, [p]: e.target.value })}
                className={`${inputCls} h-10`} />
            </Field>
          ))}
        </div>
      </Section>

      {saveError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-200">{saveError}</div>
      )}

      <div className="sticky bottom-3 z-10 flex gap-3">
        <button type="button" onClick={onCancel}
          className="h-12 rounded-xl border border-border bg-background px-5 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {personaId ? "Save changes" : "Save persona"}
        </button>
      </div>
    </div>
  );
}
