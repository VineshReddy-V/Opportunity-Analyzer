/**
 * Project-wide constants for Opportunity Analyzer Agent.
 *
 * Defaults are intentionally conservative for the Gemini free-tier path.
 * Users may raise them in the Settings panel, but we assume low defaults.
 */

/** Extension name shown in UI. */
export const APP_NAME = "Opportunity Analyzer Agent";

/** Default preferred and fallback Gemini models. */
export const DEFAULT_PRIMARY_MODEL = "gemini-2.5-flash-lite";
export const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";

/** Default OpenAI model. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/**
 * Conservative default budget. Free-tier quotas fluctuate and are not
 * guaranteed, so we start well below common published caps and let the
 * user override from Settings.
 */
export const DEFAULT_RPM = 10;
export const DEFAULT_TPM = 120_000;
export const DEFAULT_RPD = 200;
export const DEFAULT_SAFETY_RESERVE_PCT = 25;

/** Hard ceiling for LLM calls inside a single agent run. */
export const DEFAULT_MAX_CALLS_PER_RUN = 3;
export const ABSOLUTE_MAX_CALLS_PER_RUN = 3;

/** Minimal-mode threshold (percent of budget used). */
export const MINIMAL_MODE_THRESHOLD_PCT = 70;
/** Stop optional generation entirely above this percent. */
export const GENERATION_DISABLED_THRESHOLD_PCT = 85;

/** Backoff base and jitter window (ms). */
export const BACKOFF_BASE_MS = 1500;
export const BACKOFF_MAX_MS = 60_000;
export const BACKOFF_JITTER_MS = 750;

/** Maximum retries for a single Gemini call on recoverable errors. */
export const MAX_GEMINI_RETRIES = 3;

/** Max characters of raw page text we ever consider. Safety rail. */
export const MAX_PAGE_TEXT_CHARS = 40_000;
/** After normalization, cap the text we summarize into the LLM. */
export const MAX_NORMALIZED_TEXT_CHARS = 6_000;

/** DOM stability wait for SPA pages. */
export const DOM_STABILITY_MS = 600;
export const DOM_STABILITY_MAX_MS = 2_500;

/** Storage keys for chrome.storage.local. */
export const STORAGE_KEYS = {
  geminiSettings: "geminiSettings",
  rateBudgetConfig: "rateBudgetConfig",
  candidateProfileSummary: "candidateProfileSummary",
  uiPrefs: "uiPrefs",
  featureFlags: "featureFlags",
} as const;

/** IndexedDB database name and version. */
export const DB_NAME = "opportunityAnalyzerDB";
export const DB_VERSION = 1;

/** Message type namespace prefix for runtime messaging. */
export const MSG_PREFIX = "oa.";
