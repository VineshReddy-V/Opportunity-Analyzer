/**
 * Tool Registry
 *
 * Six deterministic tools exposed to the agent loop.
 * All tool calls produce timeline events persisted to `tool_events`.
 *
 *   1. classifyCurrentPage      (content script)
 *   2. extractOpportunityFromPage (content script)
 *   3. loadCandidateProfile     (chrome.storage.local)
 *   4. compareProfileToOpportunity (pure, in-worker)
 *   5. generateApplicationAssets  (Gemini via adapter; budget-aware)
 *   6. saveTrackerRecord        (IndexedDB)
 *
 * Tools 1, 2, 3, 4, 6 are fully deterministic. Tool 5 is the ONLY tool
 * that may consume Gemini budget.
 */

import { createLogger } from "@/shared/logger";
import {
  GeneratedAssetsSchema,
  LlmAnalysisSchema,
  OpportunityFactSchema,
} from "@/shared/schemas";
import type {
  CandidateProfileSummary,
  DeterministicFit,
  GeneratedAssets,
  LlmAnalysisOutput,
  OpportunityFact,
  PageSignals,
  ToolEvent,
  TrackerRecord,
} from "@/shared/types";
import { loadCandidateProfile } from "@/storage/chromeStorage";
import {
  addDraftAsset,
  addToolEvent,
  upsertTrackerRecord,
} from "@/storage/stores";
import { MSG } from "@/shared/messaging";
import {
  buildGenerateAssetsPrompt,
  buildPlanAnalyzePrompt,
} from "./promptBuilder";
import { geminiAdapter } from "./geminiAdapter";
import { hashParts, normalizeName, normalizeUrl } from "@/shared/hashing";

const log = createLogger("tools");

/**
 * Compute deterministic fit between a profile and an opportunity.
 * Scoring (spec section 24):
 *  - 50% required skill overlap
 *  - 20% preferred skill overlap
 *  - 20% role/title similarity
 *  - 10% experience signal
 */
export function compareProfileToOpportunity(
  profile: CandidateProfileSummary,
  opportunity: OpportunityFact,
): DeterministicFit {
  const norm = (s: string) => s.toLowerCase().trim();
  const tokens = (s: string) =>
    norm(s)
      .replace(/[^a-z0-9+./#\- ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const profileSkillSet = new Set(profile.topSkills.map(norm));
  const profileSkillTokenSet = new Set(
    profile.topSkills.flatMap((s) => tokens(s)),
  );

  const reqStrings = opportunity.requirements.map(norm);
  const prefStrings = opportunity.preferredSkills.map(norm);

  const requiredMatches: string[] = [];
  const requiredGaps: string[] = [];
  for (const r of opportunity.requirements) {
    const rl = norm(r);
    const rt = tokens(r);
    const hit =
      profileSkillSet.has(rl) ||
      rt.some((t) => profileSkillSet.has(t)) ||
      rt.some((t) => profileSkillTokenSet.has(t));
    if (hit) requiredMatches.push(r);
    else requiredGaps.push(r);
  }
  const preferredMatches: string[] = [];
  const preferredGaps: string[] = [];
  for (const p of opportunity.preferredSkills) {
    const pl = norm(p);
    const pt = tokens(p);
    const hit =
      profileSkillSet.has(pl) ||
      pt.some((t) => profileSkillSet.has(t)) ||
      pt.some((t) => profileSkillTokenSet.has(t));
    if (hit) preferredMatches.push(p);
    else preferredGaps.push(p);
  }

  // Title similarity: token Jaccard over title vs target roles.
  const titleTokens = new Set(tokens(opportunity.title ?? ""));
  const targetTokens = new Set(
    profile.targetRoles.flatMap((r) => tokens(r)),
  );
  let intersect = 0;
  for (const t of titleTokens) if (targetTokens.has(t)) intersect += 1;
  const union = new Set([...titleTokens, ...targetTokens]).size || 1;
  const titleSimilarity = intersect / union;

  // Experience signal: naive extraction from requirements.
  let expSignal: DeterministicFit["experienceSignal"] = "unknown";
  const expRegex = /(\d+)\+?\s*(?:years?|yrs?)/i;
  for (const r of opportunity.requirements) {
    const m = r.match(expRegex);
    if (m) {
      const req = parseInt(m[1], 10);
      if (Number.isFinite(req)) {
        if (profile.experienceYears >= req + 1) expSignal = "above";
        else if (profile.experienceYears >= req - 0.1) expSignal = "match";
        else expSignal = "below";
      }
      break;
    }
  }

  const reqTotal = reqStrings.length || 1;
  const prefTotal = prefStrings.length || 1;
  const reqPct = requiredMatches.length / reqTotal;
  const prefPct = preferredMatches.length / prefTotal;

  const expPts =
    expSignal === "above" ? 1 : expSignal === "match" ? 0.8 : expSignal === "below" ? 0.2 : 0.5;

  const score =
    50 * reqPct +
    20 * prefPct +
    20 * titleSimilarity +
    10 * expPts;

  const notes: string[] = [];
  if (requiredGaps.length > 0)
    notes.push(`${requiredGaps.length} required skill gap(s) detected`);
  if (titleSimilarity < 0.2)
    notes.push("Title differs noticeably from target roles");
  if (profile.topSkills.length === 0)
    notes.push("Profile has no skills listed; accuracy will be low");

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    requiredSkillMatches: requiredMatches,
    requiredSkillGaps: requiredGaps,
    preferredSkillMatches: preferredMatches,
    preferredSkillGaps: preferredGaps,
    titleSimilarity,
    experienceSignal: expSignal,
    notes,
  };
}

// --- Timeline helper --------------------------------------------------------

export interface TimelineSink {
  runId: string;
  step: number;
  record(ev: Omit<ToolEvent, "runId" | "stepNumber" | "timestamp">): Promise<ToolEvent>;
  nextStep(): number;
}

export function createTimelineSink(
  runId: string,
  broadcast: (ev: ToolEvent) => void,
): TimelineSink {
  const state = { step: 0 };
  return {
    runId,
    get step() {
      return state.step;
    },
    nextStep() {
      state.step += 1;
      return state.step;
    },
    async record(partial) {
      const ev: ToolEvent = {
        ...partial,
        runId,
        stepNumber: state.step,
        timestamp: Date.now(),
      };
      const id = await addToolEvent(ev);
      const full: ToolEvent = { ...ev, id };
      try {
        broadcast(full);
      } catch (e) {
        log.warn("timeline broadcast failed", e);
      }
      return full;
    },
  };
}

// --- Helper for content script calls ---------------------------------------

function sendToTab<T, R>(
  tabId: number,
  msg: T,
  timeoutMs = 6000,
): Promise<R> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Content script did not respond in time; page may be slow.",
          ),
        ),
      timeoutMs,
    );
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp: R) => {
        clearTimeout(timer);
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          reject(new Error(lastErr.message));
        } else {
          resolve(resp);
        }
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function ensureContentScript(tabId: number): Promise<void> {
  // The content script is declared in manifest (content_scripts) so
  // @crxjs bundles it with the correct path and Chrome auto-injects it
  // on page load. That script is strictly reactive (only an onMessage
  // listener) so it does no work until we message it from here.
  //
  // If for some reason the script hasn't attached (e.g., the page
  // finished loading before the extension installed), we send a ping;
  // when it fails, we bail early with a friendly error.
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("content script unresponsive")),
        600,
      );
      chrome.tabs.sendMessage(tabId, { type: "__oa_ping__" }, () => {
        clearTimeout(timer);
        // lastError is expected if no handler returned a response; we
        // treat any synchronous answer as a successful ping.
        void chrome.runtime.lastError;
        resolve();
      });
    });
  } catch {
    // Try a one-shot manual injection as a fallback — use the manifest
    // content_scripts registration to find the script.
    try {
      // No reliable public API to fetch the registered files; rely on
      // the default match injection. If the page is privileged
      // (chrome://) this throws a clear error.
      await chrome.scripting
        .getRegisteredContentScripts?.()
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
    // We've done what we can; the next sendToTab call will fail loudly
    // if the page blocks content scripts.
  }
}

// --- Tool 1: classifyCurrentPage -------------------------------------------

export async function toolClassifyCurrentPage(
  sink: TimelineSink,
  tabId: number,
): Promise<{ pageType: string; signals: PageSignals }> {
  sink.nextStep();
  const start = Date.now();
  await sink.record({
    kind: "tool",
    name: "classifyCurrentPage",
    status: "start",
    reasoningSummary: "Classify page cheaply before any LLM work",
    argsPreview: { tabId },
  });
  await ensureContentScript(tabId);
  const resp = await sendToTab<any, any>(tabId, { type: MSG.contentClassify });
  if (!resp?.ok || !resp.pageType) {
    const reason = resp?.error ?? "unknown";
    await sink.record({
      kind: "tool",
      name: "classifyCurrentPage",
      status: "error",
      resultPreview: reason,
      durationMs: Date.now() - start,
    });
    throw new Error(`classifyCurrentPage failed: ${reason}`);
  }
  await sink.record({
    kind: "tool",
    name: "classifyCurrentPage",
    status: "ok",
    resultPreview: `type=${resp.pageType}, headings=${resp.signals?.topHeadings?.length ?? 0}`,
    reasoningSummary: `Page classified as ${resp.pageType}`,
    durationMs: Date.now() - start,
  });
  return { pageType: resp.pageType, signals: resp.signals };
}

// --- Tool 2: extractOpportunityFromPage ------------------------------------

export async function toolExtractOpportunityFromPage(
  sink: TimelineSink,
  tabId: number,
  url: string,
): Promise<OpportunityFact> {
  sink.nextStep();
  const start = Date.now();
  await sink.record({
    kind: "tool",
    name: "extractOpportunityFromPage",
    status: "start",
    argsPreview: { tabId, url: normalizeUrl(url) },
    reasoningSummary: "Deterministic extraction (adapter or generic)",
  });
  const resp = await sendToTab<any, any>(tabId, {
    type: MSG.contentExtract,
    allowAdapters: true,
  });
  if (!resp?.ok || !resp.opportunity) {
    await sink.record({
      kind: "tool",
      name: "extractOpportunityFromPage",
      status: "error",
      resultPreview: resp?.error ?? "unknown error",
      durationMs: Date.now() - start,
    });
    throw new Error(`extractOpportunityFromPage failed: ${resp?.error ?? ""}`);
  }
  const parsed = OpportunityFactSchema.parse(resp.opportunity);
  // Ensure content hash present.
  if (!parsed.contentHash) {
    parsed.contentHash = hashParts(
      parsed.title,
      parsed.company,
      parsed.requirements.join("|"),
    );
  }
  await sink.record({
    kind: "tool",
    name: "extractOpportunityFromPage",
    status: "ok",
    resultPreview: `title=${parsed.title ?? "?"}, reqs=${parsed.requirements.length}, conf=${parsed.confidence.toFixed(2)}`,
    reasoningSummary: `Extracted via ${parsed.source} with confidence ${parsed.confidence.toFixed(2)}`,
    durationMs: Date.now() - start,
  });
  return parsed;
}

// --- Tool 3: loadCandidateProfile ------------------------------------------

export async function toolLoadCandidateProfile(
  sink: TimelineSink,
): Promise<CandidateProfileSummary | undefined> {
  sink.nextStep();
  const start = Date.now();
  await sink.record({
    kind: "tool",
    name: "loadCandidateProfile",
    status: "start",
    reasoningSummary: "Load locally stored candidate profile summary",
  });
  const prof = await loadCandidateProfile();
  await sink.record({
    kind: "tool",
    name: "loadCandidateProfile",
    status: prof ? "ok" : "error",
    resultPreview: prof
      ? `roles=${prof.targetRoles.length}, skills=${prof.topSkills.length}, redacted=${prof.redactedMode}`
      : "No profile found",
    durationMs: Date.now() - start,
  });
  return prof;
}

// --- Tool 4: compareProfileToOpportunity -----------------------------------

export async function toolCompareProfileToOpportunity(
  sink: TimelineSink,
  profile: CandidateProfileSummary,
  opportunity: OpportunityFact,
): Promise<DeterministicFit> {
  sink.nextStep();
  const start = Date.now();
  await sink.record({
    kind: "tool",
    name: "compareProfileToOpportunity",
    status: "start",
    reasoningSummary: "Deterministic fit scoring (no LLM)",
  });
  const fit = compareProfileToOpportunity(profile, opportunity);
  await sink.record({
    kind: "tool",
    name: "compareProfileToOpportunity",
    status: "ok",
    resultPreview: `score=${fit.score}, title=${fit.titleSimilarity.toFixed(2)}, exp=${fit.experienceSignal}`,
    reasoningSummary: `Deterministic fit score ${fit.score}/100`,
    durationMs: Date.now() - start,
  });
  return fit;
}

// --- Tool 5: generateApplicationAssets -------------------------------------

export async function toolGenerateApplicationAssets(
  sink: TimelineSink,
  input: {
    opportunity: OpportunityFact;
    profile: CandidateProfileSummary;
    fit: DeterministicFit;
    analysis: LlmAnalysisOutput;
    mode: "normal" | "minimal";
  },
): Promise<GeneratedAssets> {
  sink.nextStep();
  const start = Date.now();
  const prompt = buildGenerateAssetsPrompt({
    opportunity: input.opportunity,
    profile: input.profile,
    fit: input.fit,
    recommendation: input.analysis.recommendation,
    strengths: input.analysis.strengths,
    gaps: input.analysis.gaps,
    mode: input.mode,
  });
  await sink.record({
    kind: "llm",
    name: "gemini:generate_assets",
    status: "start",
    reasoningSummary: "Generate concise recruiter note + bullets",
    argsPreview: {
      promptChars: prompt.length,
      temperature: 0.2,
      mode: input.mode,
    },
  });
  try {
    const out = await geminiAdapter.call({
      prompt,
      callLabel: "generate_assets",
      temperature: 0.2,
      maxOutputTokens: 600,
    });
    const parsed = GeneratedAssetsSchema.parse(tryParseJson(out.text));
    await sink.record({
      kind: "llm",
      name: "gemini:generate_assets",
      status: "ok",
      resultPreview: `note=${parsed.recruiterNote.length}ch, bullets=${parsed.tailoredBullets.length}`,
      durationMs: Date.now() - start,
    });
    return parsed;
  } catch (e) {
    await sink.record({
      kind: "llm",
      name: "gemini:generate_assets",
      status: "error",
      resultPreview: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    });
    throw e;
  }
}

export async function llmPlanAnalyze(
  sink: TimelineSink,
  input: {
    userRequest: string;
    opportunity: OpportunityFact;
    profile: CandidateProfileSummary;
    fit: DeterministicFit;
    historyForCompression: ToolEvent[];
    forceMinimal: boolean;
  },
): Promise<LlmAnalysisOutput> {
  sink.nextStep();
  const start = Date.now();
  const prompt = buildPlanAnalyzePrompt({
    userRequest: input.userRequest,
    opportunity: input.opportunity,
    profile: input.profile,
    fit: input.fit,
    history: input.historyForCompression,
    forceMinimal: input.forceMinimal,
  });
  await sink.record({
    kind: "llm",
    name: "gemini:plan_analyze",
    status: "start",
    reasoningSummary: "Plan + ground analysis in compact evidence",
    argsPreview: { promptChars: prompt.length, temperature: 0.2 },
  });
  try {
    const out = await geminiAdapter.call({
      prompt,
      callLabel: "plan_analyze",
      temperature: 0.2,
      maxOutputTokens: 500,
    });
    const parsed = LlmAnalysisSchema.parse(tryParseJson(out.text));
    await sink.record({
      kind: "llm",
      name: "gemini:plan_analyze",
      status: "ok",
      resultPreview: `${parsed.recommendation}; strengths=${parsed.strengths.length}, gaps=${parsed.gaps.length}`,
      reasoningSummary: parsed.reasoningSummary,
      durationMs: Date.now() - start,
    });
    return parsed;
  } catch (e) {
    await sink.record({
      kind: "llm",
      name: "gemini:plan_analyze",
      status: "error",
      resultPreview: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    });
    throw e;
  }
}

// --- Tool 6: saveTrackerRecord ---------------------------------------------

export async function toolSaveTrackerRecord(
  sink: TimelineSink,
  input: {
    runId: string;
    opportunity: OpportunityFact;
    fit?: DeterministicFit;
    assets?: GeneratedAssets;
  },
): Promise<TrackerRecord> {
  sink.nextStep();
  const start = Date.now();
  await sink.record({
    kind: "tool",
    name: "saveTrackerRecord",
    status: "start",
    reasoningSummary: "Persist record to local tracker (IndexedDB)",
  });
  const confidence = input.opportunity.confidence;
  const warnings = input.opportunity.warnings.slice(0, 10);
  const needsReview = confidence < 0.6 || warnings.length > 0;
  const rec: TrackerRecord = {
    id: crypto.randomUUID(),
    urlKey: normalizeUrl(input.opportunity.url),
    titleKey: normalizeName(input.opportunity.title),
    companyKey: normalizeName(input.opportunity.company),
    url: input.opportunity.url,
    title: input.opportunity.title,
    company: input.opportunity.company,
    location: input.opportunity.location,
    opportunity: input.opportunity,
    fit: input.fit,
    assets: input.assets,
    status: needsReview ? "review_needed" : "saved",
    runId: input.runId,
    confidence,
    warnings,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const saved = await upsertTrackerRecord(rec);
  if (input.assets) {
    await addDraftAsset({
      runId: input.runId,
      trackerId: saved.id,
      assets: input.assets,
      createdAt: Date.now(),
    });
  }
  await sink.record({
    kind: "tool",
    name: "saveTrackerRecord",
    status: "ok",
    resultPreview: `id=${saved.id}, status=${saved.status}`,
    reasoningSummary: needsReview
      ? "Saved with status=review_needed due to low confidence/warnings"
      : "Saved with status=saved",
    durationMs: Date.now() - start,
  });
  return saved;
}

// --- JSON parse helper ------------------------------------------------------

function tryParseJson(text: string): unknown {
  const trimmed = (text ?? "").trim();
  // Strip code fences if the model accidentally added them.
  const unfenced = trimmed.replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(unfenced);
  } catch (e) {
    // Attempt to extract the outermost JSON object.
    const first = unfenced.indexOf("{");
    const last = unfenced.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(unfenced.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("LLM returned non-JSON output");
  }
}
