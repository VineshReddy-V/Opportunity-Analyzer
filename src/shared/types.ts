/**
 * Shared TypeScript types for Opportunity Analyzer Agent.
 *
 * These are the canonical wire-level contracts used between the
 * content script, background service worker, and React side panel.
 * Many of these types have matching Zod schemas in `schemas.ts`.
 */

export type PageType =
  | "opportunity_detail"
  | "opportunity_listing"
  | "company_page"
  | "unknown"
  | "irrelevant";

export type RunStatus =
  | "queued"
  | "running"
  | "backoff"
  | "done"
  | "error"
  | "cancelled"
  | "needs_user_input";

export type AgentMode = "normal" | "minimal";

export type BudgetHealth = "healthy" | "constrained" | "exhausted";

export interface GeminiSettings {
  /** Plain-text API key stored only in chrome.storage.local. */
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  /** If true, do not call the network; return canned responses. Dev only. */
  mockMode: boolean;
}

export interface RateBudgetConfig {
  rpm: number;
  tpm: number;
  rpd: number;
  /** 0–100 percent; budget manager reserves this fraction. */
  safetyReservePct: number;
  /** Cap LLM calls per run (never exceeds ABSOLUTE_MAX_CALLS_PER_RUN). */
  maxCallsPerRun: number;
  /** Automatically switch to minimal mode when budget gets tight. */
  autoMinimalMode: boolean;
}

export interface CandidateProfileSummary {
  /** Display name (never sent to LLM unless user explicitly opts in). */
  displayName?: string;
  targetRoles: string[];
  experienceYears: number;
  topSkills: string[];
  projectHighlights: string[];
  preferredLocations: string[];
  summary: string;
  /** When true, only the redacted summary fields are shared with Gemini. */
  redactedMode: boolean;
  updatedAt: number;
}

export interface UiPrefs {
  theme: "dark" | "light";
  showBudgetPanel: boolean;
  showDebug: boolean;
}

export interface PageSignals {
  url: string;
  hostname: string;
  title: string;
  topHeadings: string[];
  textSample: string;
  hasJsonLd: boolean;
  jsonLdTypes: string[];
  /** MD-ish snippet of the first N headings + text for classification. */
  compactDigest: string;
}

export interface OpportunityFact {
  title?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  salaryText?: string;
  postedDate?: string;
  url: string;
  description?: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  benefits: string[];
  applyUrl?: string;
  source: string; // adapter name or "generic"
  confidence: number; // 0..1
  warnings: string[];
  /** Canonical content hash for caching; url+title+requirements hash. */
  contentHash: string;
}

export interface DeterministicFit {
  /** 0..100 deterministic score. */
  score: number;
  requiredSkillMatches: string[];
  requiredSkillGaps: string[];
  preferredSkillMatches: string[];
  preferredSkillGaps: string[];
  titleSimilarity: number; // 0..1
  experienceSignal: "below" | "match" | "above" | "unknown";
  notes: string[];
}

export interface GeneratedAssets {
  recruiterNote: string;
  applicationSummary: string;
  tailoredBullets: string[];
  /** Which mode produced these assets. */
  producedIn: AgentMode;
}

/** Timeline event persisted to IndexedDB and streamed to the side panel. */
export interface ToolEvent {
  id?: number;
  runId: string;
  stepNumber: number;
  kind: "tool" | "llm" | "state" | "info" | "error";
  name: string;
  status: "start" | "ok" | "error" | "info";
  /** Sanitized arguments; never includes API keys or full resume text. */
  argsPreview?: Record<string, unknown>;
  resultPreview?: string;
  reasoningSummary?: string;
  durationMs?: number;
  timestamp: number;
}

export interface BudgetEvent {
  id?: number;
  timestamp: number;
  kind: "429" | "decision" | "backoff" | "call_ok" | "call_err";
  detail: string;
  mode?: AgentMode;
  windowUsage?: {
    rpmUsed: number;
    tpmUsed: number;
    rpdUsed: number;
  };
}

export interface RunRecord {
  id: string;
  tabId: number;
  url: string;
  hostname: string;
  startedAt: number;
  finishedAt?: number;
  status: RunStatus;
  mode: AgentMode;
  callsMade: number;
  pageSignals?: PageSignals;
  opportunity?: OpportunityFact;
  fit?: DeterministicFit;
  llmAnalysis?: LlmAnalysisOutput;
  assets?: GeneratedAssets;
  finalAnswer?: string;
  errorMessage?: string;
}

export interface LlmAnalysisOutput {
  fitExplanation: string;
  strengths: string[];
  gaps: string[];
  recommendation: "apply" | "tailor_then_apply" | "skip";
  needsGeneration: boolean;
  reasoningSummary: string;
}

export interface LlmPlanOutput {
  reasoningSummary: string;
  nextToolCalls: string[];
  skipGeneration: boolean;
}

export interface TrackerRecord {
  id: string;
  /** URL used as primary identity; normalized. */
  urlKey: string;
  titleKey: string;
  companyKey: string;
  url: string;
  title?: string;
  company?: string;
  location?: string;
  opportunity: OpportunityFact;
  fit?: DeterministicFit;
  assets?: GeneratedAssets;
  status: TrackerStatus;
  runId: string;
  confidence: number;
  warnings: string[];
  createdAt: number;
  updatedAt: number;
}

export type TrackerStatus =
  | "saved"
  | "review_needed"
  | "ready_to_apply"
  | "applied"
  | "archived";

export interface CacheEntry {
  id?: number;
  /** url + contentHash */
  key: string;
  opportunity: OpportunityFact;
  createdAt: number;
}

export interface PageSnapshot {
  id?: number;
  runId: string;
  url: string;
  contentHash: string;
  signals: PageSignals;
  rawTextSample: string;
  createdAt: number;
}

export interface DraftAsset {
  id?: number;
  runId: string;
  trackerId?: string;
  assets: GeneratedAssets;
  createdAt: number;
}

/** Lightweight budget snapshot emitted to the UI. */
export interface BudgetSnapshot {
  mode: AgentMode;
  health: BudgetHealth;
  rpmUsedPct: number;
  tpmUsedPct: number;
  rpdUsedPct: number;
  activeModel: string;
  queuedRuns: number;
  recent429: boolean;
  backoffUntil?: number;
}
