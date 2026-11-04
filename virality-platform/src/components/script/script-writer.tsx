"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2, UserRound } from "lucide-react";
import { GuidedFlow } from "@/components/script/guided-flow";
import { QuickMode } from "@/components/script/quick-mode";
import { SavedScripts } from "@/components/script/saved-scripts";
import { usePersonas } from "@/lib/use-personas";
import type { SavedScript } from "@/lib/script-flow";

type Tab = "guided" | "saved" | "quick";

/** Links arrive as ?videoUrl=… (analysis panel) or ?hook=…&topic=… (Hook Library). */
export function ScriptWriter({ videoUrl, hook, topic }: { videoUrl?: string; hook?: string; topic?: string }) {

  const { active, personas } = usePersonas();
  const [tab, setTab] = useState<Tab>("guided");
  const [openScript, setOpenScript] = useState<SavedScript | null>(null);
  const [flowKey, setFlowKey] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);

  const startNew = () => {
    setOpenScript(null);
    setFlowKey((k) => k + 1);
    setTab("guided");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600">
            <FileText className="h-5 w-5 text-white" />
          </span>
          Script Writer
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Topic → research → hook → script, grounded in a real viral video and written in your voice.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ["guided", "Guided"],
          ["saved", "Saved scripts"],
          ["quick", "Quick mode"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              tab === key
                ? "border-transparent bg-gradient-to-r from-red-500 to-orange-500 text-white"
                : "glass border-white/[0.08] text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {tab === "guided" && (openScript || flowKey > 0) && (
          <button onClick={startNew} className="ml-auto text-xs text-orange-600 dark:text-orange-300 hover:underline">Start a new script</button>
        )}
      </div>

      {tab === "quick" ? (
        <QuickMode initialTopic={topic} initialHook={hook} />
      ) : personas === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading personas…</p>
      ) : !active ? (
        <div className="glass rounded-2xl p-8 sm:p-12 text-center space-y-3">
          <UserRound className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold">{personas.length ? "Pick a persona first" : "Create your persona first"}</h3>
          <p className="text-sm text-muted-foreground">
            The guided flow writes in your voice, for your one audience. {personas.length ? "Choose a persona in the sidebar." : "It takes about two minutes."}
          </p>
          <Link href="/persona" className="inline-block rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {personas.length ? "Manage personas" : "Create persona"}
          </Link>
          <p className="text-xs text-muted-foreground">Or use <button className="underline" onClick={() => setTab("quick")}>Quick mode</button> without a persona.</p>
        </div>
      ) : (
        <>
          <div className="glass rounded-2xl px-4 py-3 text-sm flex flex-wrap items-center gap-2 border border-orange-500/20">
            <UserRound className="h-4 w-4 text-orange-600 dark:text-orange-300" />
            <span>Writing as <b>{active.name}</b> · {active.niche}</span>
          </div>
          {tab === "guided" ? (
            <GuidedFlow
              key={`${active.id}-${flowKey}-${openScript?.id ?? "new"}`}
              persona={active}
              initialVideoUrl={openScript ? undefined : videoUrl}
              initialHook={openScript ? undefined : hook}
              initialTopic={openScript ? undefined : topic}
              openScript={openScript}
              onSaved={() => setSavedVersion((v) => v + 1)}
            />
          ) : (
            <SavedScripts
              personaId={active.id} refreshKey={savedVersion}
              onOpen={(s) => {
                setOpenScript(s);
                setTab("guided");
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
