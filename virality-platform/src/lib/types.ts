export interface Config {
  id: string;
  configName: string;
  creatorsCategory: string;
  analysisInstruction: string;
  newConceptsInstruction: string;
}

export interface Creator {
  id: string;
  username: string;
  category: string;
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
  lastScrapedAt: string;
}

export interface Video {
  id: string;
  link: string;
  thumbnail: string;
  creator: string;
  views: number;
  likes: number;
  comments: number;
  analysis: string;
  newConcepts: string;
  datePosted: string;
  dateAdded: string;
  configName: string;
  starred: boolean;
}

export interface PipelineParams {
  configName: string;
  maxVideos: number;
  topK: number;
  nDays: number;
}

export interface ActiveTask {
  id: string;
  creator: string;
  step: string;
  views?: number;
}

export interface PipelineProgress {
  status: "idle" | "running" | "completed" | "error";
  phase: "scraping" | "analyzing" | "done";
  activeTasks: ActiveTask[];
  creatorsCompleted: number;
  creatorsTotal: number;
  creatorsScraped: number;
  videosAnalyzed: number;
  videosTotal: number;
  /** Top reels skipped because this config already analyzed them (no cost). */
  videosSkipped?: number;
  errors: string[];
  log: string[];
}

// ── F2: Persona ─────────────────────────────────────────────────────────────

export type PersonaPlatform = "instagram" | "youtube" | "tiktok";

export interface Persona {
  id: string;
  name: string; // e.g. "Yash – AI Growth Consultant", "Client: Sharma Insurance"
  niche: string; // "Insurance tips for new immigrants in Canada"
  avatar: {
    // ONE specific target viewer
    who: string; // "First-year newcomers in the GTA, 25–35, first job"
    painPoints: string[]; // 3–5
    desires: string[]; // 3–5
    objections: string[]; // optional
  };
  topics: string[]; // 3–6 narrow content pillars
  voice: {
    tone: string; // "friendly, direct, slightly funny"
    language: string; // "English", "Hinglish", "Marathi"...
    phrasesToUse: string[];
    phrasesToAvoid: string[];
    sampleScript?: string; // 1–3 of their past scripts/captions
  };
  offer?: string; // what they sell / the CTA destination
  platforms: PersonaPlatform[];
  handles?: { instagram?: string; youtube?: string; tiktok?: string };
  createdAt: string;
  updatedAt: string;
}

// ── F3/F6: Saved hook formulas ──────────────────────────────────────────────

export interface SavedHook {
  id: string;
  personaId?: string;
  template: string;
  structureName: string;
  libraryId?: string;
  variables: { name: string; example: string }[];
  sourceVideoUrl?: string;
  sourceTitle?: string;
  sourceViews?: number;
  createdAt: string;
}
