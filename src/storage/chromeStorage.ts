/**
 * Thin, typed wrappers over `chrome.storage.local`.
 *
 * We split config/settings between chrome.storage.local (small, synced
 * per-device inputs such as API key, model choices, budget config, profile)
 * and IndexedDB (runtime data). This mirrors the spec's storage design.
 */

import {
  CandidateProfileSummarySchema,
  GeminiSettingsSchema,
  RateBudgetConfigSchema,
} from "@/shared/schemas";
import { STORAGE_KEYS } from "@/shared/constants";
import type {
  CandidateProfileSummary,
  GeminiSettings,
  RateBudgetConfig,
  UiPrefs,
} from "@/shared/types";

async function getRaw<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([key], (out) => {
        resolve(out?.[key] as T | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

async function setRaw(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// --- Gemini settings --------------------------------------------------------

export async function loadGeminiSettings(): Promise<GeminiSettings> {
  const raw = await getRaw<unknown>(STORAGE_KEYS.geminiSettings);
  return GeminiSettingsSchema.parse(raw ?? {});
}

export async function saveGeminiSettings(
  s: GeminiSettings,
): Promise<void> {
  const parsed = GeminiSettingsSchema.parse(s);
  await setRaw(STORAGE_KEYS.geminiSettings, parsed);
}

// --- Rate budget config -----------------------------------------------------

export async function loadBudgetConfig(): Promise<RateBudgetConfig> {
  const raw = await getRaw<unknown>(STORAGE_KEYS.rateBudgetConfig);
  return RateBudgetConfigSchema.parse(raw ?? {});
}

export async function saveBudgetConfig(
  c: RateBudgetConfig,
): Promise<void> {
  const parsed = RateBudgetConfigSchema.parse(c);
  await setRaw(STORAGE_KEYS.rateBudgetConfig, parsed);
}

// --- Candidate profile ------------------------------------------------------

export async function loadCandidateProfile(): Promise<
  CandidateProfileSummary | undefined
> {
  const raw = await getRaw<unknown>(STORAGE_KEYS.candidateProfileSummary);
  if (!raw) return undefined;
  try {
    return CandidateProfileSummarySchema.parse(raw);
  } catch {
    return undefined;
  }
}

export async function saveCandidateProfile(
  p: CandidateProfileSummary,
): Promise<void> {
  const parsed = CandidateProfileSummarySchema.parse({
    ...p,
    updatedAt: Date.now(),
  });
  await setRaw(STORAGE_KEYS.candidateProfileSummary, parsed);
}

// --- UI prefs ---------------------------------------------------------------

const DEFAULT_UI_PREFS: UiPrefs = {
  theme: "dark",
  showBudgetPanel: true,
  showDebug: false,
};

export async function loadUiPrefs(): Promise<UiPrefs> {
  const raw = await getRaw<UiPrefs>(STORAGE_KEYS.uiPrefs);
  return { ...DEFAULT_UI_PREFS, ...(raw ?? {}) };
}

export async function saveUiPrefs(p: UiPrefs): Promise<void> {
  await setRaw(STORAGE_KEYS.uiPrefs, p);
}
