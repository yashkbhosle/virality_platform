"use client";

// Client-side helpers for the active persona.
// The active persona id lives in localStorage under `viralos_active_persona`
// and is shared across components via a window event.

import { useCallback, useSyncExternalStore } from "react";

export const ACTIVE_PERSONA_KEY = "viralos_active_persona";
const CHANGE_EVENT = "viralos:active-persona-change";
export const PERSONAS_CHANGED_EVENT = "viralos:personas-changed";

function read(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PERSONA_KEY);
  } catch {
    return null;
  }
}

export function setActivePersonaId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_PERSONA_KEY, id);
    else window.localStorage.removeItem(ACTIVE_PERSONA_KEY);
  } catch {
    // storage unavailable (private mode); the in-memory event still fires
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Tell listeners (e.g. the sidebar switcher) that personas were created/edited/deleted. */
export function notifyPersonasChanged() {
  window.dispatchEvent(new Event(PERSONAS_CHANGED_EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_PERSONA_KEY) cb();
  };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Returns [activePersonaId, setActivePersonaId]. `null` on the server and when none is set. */
export function useActivePersonaId(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((next: string | null) => setActivePersonaId(next), []);
  return [id, set];
}
