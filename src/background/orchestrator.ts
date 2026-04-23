/**
 * Agent Orchestrator
 *
 * Drives a single run through the state machine:
 *   IDLE -> BOOTSTRAP -> CLASSIFY_PAGE -> EXTRACT_PAGE ->
 *   LOAD_PROFILE -> COMPARE -> PLAN_ANALYZE ->
 *   (GENERATE_ASSETS) -> SAVE_TRACKER -> DONE
 *
 * Deterministic tools execute first, then at most 1–2 Gemini calls.
 * Enforces a hard cap on LLM calls per run.
 *
 * Produces a RunRecord, tool events, and a (new or updated) tracker row.
 */

import { createLogger } from "@/shared/logger";
import {
  ABSOLUTE_MAX_CALLS_PER_RUN,
  MAX_NORMALIZED_TEXT_CHARS,
} from "@/shared/constants";
import { StateMachine, type AgentState } from "./stateMachine";
import {
  createTimelineSink,
  llmPlanAnalyze,
  toolClassifyCurrentPage,
  toolCompareProfileToOpportunity,
  toolExtractOpportunityFromPage,
  toolGenerateApplicationAssets,
  toolLoadCandidateProfile,
  toolSaveTrackerRecord,
} from "./toolRegistry";
import { budgetManager } from "./budgetManager";
import {
  addPageSnapshot,
  listToolEvents,
  putRun,
} from "@/storage/stores";
import type {
  OpportunityFact,
  PageSignals,
  RunRecord,
  ToolEvent,
} from "@/shared/types";
import { normalizeUrl } from "@/shared/hashing";

const log = createLogger("orch");

export interface OrchestratorHooks {
  onRunUpdate: (run: RunRecord) => void;
  onToolEvent: (ev: ToolEvent) => void;
  onStateChange?: (from: AgentState, to: AgentState) => void;
}

export interface OrchestratorInput {
  runId: string;
  tabId: number;
  url: string;
  forceMinimal: boolean;
  cancelSignal: () => boolean;
}

export interface OrchestratorResult {
  run: RunRecord;
}

export async function runOrchestrator(
  input: OrchestratorInput,
  hooks: OrchestratorHooks,
): Promise<OrchestratorResult> {
  const { runId, tabId, url, forceMinimal, cancelSignal } = input;
  const fsm = new StateMachine({
    onTransition: (from, to) => {
      log.info("fsm", from, "->", to);
      hooks.onStateChange?.(from, to);
    },
  });

  const sink = createTimelineSink(runId, hooks.onToolEvent);

  const run: RunRecord = {
    id: runId,
    tabId,
    url,
    hostname: hostnameOf(url),
    startedAt: Date.now(),
    status: "running",
    mode: forceMinimal ? "minimal" : budgetManager.getMode(),
    callsMade: 0,
  };
  await putRun(run);
  hooks.onRunUpdate({ ...run });

  const persistRun = async (patch: Partial<RunRecord>) => {
    Object.assign(run, patch);
    await putRun({ ...run });
    hooks.onRunUpdate({ ...run });
  };

  const maxCalls = Math.min(
    ABSOLUTE_MAX_CALLS_PER_RUN,
    budgetManager.getConfig().maxCallsPerRun,
  );

  const throwIfCancelled = () => {
    if (cancelSignal()) {
      throw new CancelError();
    }
  };

  try {
    // --- BOOTSTRAP ---------------------------------------------------------
    fsm.go("BOOTSTRAP");
    sink.nextStep();
    await sink.record({
      kind: "state",
      name: "BOOTSTRAP",
      status: "info",
      reasoningSummary: `Starting run in ${run.mode} mode (max ${maxCalls} LLM calls)`,
    });

    // --- CLASSIFY_PAGE -----------------------------------------------------
    fsm.go("CLASSIFY_PAGE");
    throwIfCancelled();
    const { pageType, signals } = await toolClassifyCurrentPage(sink, tabId);
    run.pageSignals = signals;

    if (pageType === "irrelevant") {
      await finalizeEarlyIrrelevant(sink, fsm, run, persistRun);
      return { run };
    }
    if (pageType === "unknown") {
      // We still try extraction but warn.
      sink.nextStep();
      await sink.record({
        kind: "info",
        name: "info",
        status: "info",
        reasoningSummary:
          "Page type unclear; attempting generic extraction with caution",
      });
    }

    // --- EXTRACT_PAGE ------------------------------------------------------
    fsm.go("EXTRACT_PAGE");
    throwIfCancelled();
    const opportunity = await toolExtractOpportunityFromPage(sink, tabId, url);
    run.opportunity = opportunity;
    await addPageSnapshot({
      runId,
      url: normalizeUrl(url),
      contentHash: opportunity.contentHash,
      signals,
      rawTextSample: (signals.textSample ?? "").slice(
        0,
        MAX_NORMALIZED_TEXT_CHARS,
      ),
      createdAt: Date.now(),
    });

    // --- LOAD_PROFILE ------------------------------------------------------
    fsm.go("LOAD_PROFILE");
    throwIfCancelled();
    const profile = await toolLoadCandidateProfile(sink);
    if (!profile) {
      await finalizeNoProfile(sink, fsm, run, persistRun);
      return { run };
    }

    // --- COMPARE -----------------------------------------------------------
    fsm.go("COMPARE");
    throwIfCancelled();
    const fit = await toolCompareProfileToOpportunity(
      sink,
      profile,
      opportunity,
    );
    run.fit = fit;

    // --- PLAN_ANALYZE (LLM call 1) -----------------------------------------
    fsm.go("PLAN_ANALYZE");
    throwIfCancelled();
    if (maxCalls < 1) {
      await finalizeWithoutLlm(sink, fsm, run, persistRun);
      return { run };
    }

    const history = await listToolEvents(runId);
    const planAnalyze = await withLlmRetry(2, async () =>
      llmPlanAnalyze(sink, {
        userRequest:
          "Analyze this page, tell me if it matches my profile, summarize strengths and gaps, and recommend next steps.",
        opportunity,
        profile,
        fit,
        historyForCompression: history,
        forceMinimal: forceMinimal || run.mode === "minimal",
      }),
    );
    run.llmAnalysis = planAnalyze;
    run.callsMade += 1;
    await persistRun({});

    // --- GENERATE_ASSETS (LLM call 2, optional) ----------------------------
    let assets = undefined as Awaited<
      ReturnType<typeof toolGenerateApplicationAssets>
    > | undefined;
    const shouldGenerate =
      planAnalyze.needsGeneration &&
      planAnalyze.recommendation !== "skip" &&
      run.callsMade < maxCalls &&
      !budgetManager.shouldSkipOptionalGeneration();

    if (shouldGenerate) {
      fsm.go("GENERATE_ASSETS");
      throwIfCancelled();
      try {
        assets = await toolGenerateApplicationAssets(sink, {
          opportunity,
          profile,
          fit,
          analysis: planAnalyze,
          mode: run.mode,
        });
        run.assets = assets;
        run.callsMade += 1;
      } catch (e) {
        log.warn("generate_assets failed; proceeding without assets", e);
        sink.nextStep();
        await sink.record({
          kind: "info",
          name: "info",
          status: "info",
          reasoningSummary:
            "Skipping asset generation after error; continuing with analysis only",
        });
      }
    } else {
      sink.nextStep();
      await sink.record({
        kind: "info",
        name: "info",
        status: "info",
        reasoningSummary: budgetManager.shouldSkipOptionalGeneration()
          ? "Skipping generation: budget pressure"
          : planAnalyze.recommendation === "skip"
            ? "Skipping generation: recommendation=skip"
            : run.callsMade >= maxCalls
              ? `Skipping generation: max LLM calls reached (${maxCalls})`
              : "Skipping generation: LLM judged it unnecessary",
      });
    }

    // --- SAVE_TRACKER ------------------------------------------------------
    fsm.go("SAVE_TRACKER");
    throwIfCancelled();
    const saved = await toolSaveTrackerRecord(sink, {
      runId,
      opportunity,
      fit,
      assets,
    });

    // Compose final user-facing answer.
    const finalAnswer = composeFinalAnswer(opportunity, fit, planAnalyze, assets);
    run.finalAnswer = finalAnswer;
    run.status = "done";
    run.finishedAt = Date.now();
    run.mode = budgetManager.getMode();
    await persistRun({});
    fsm.go("DONE");
    sink.nextStep();
    await sink.record({
      kind: "state",
      name: "DONE",
      status: "ok",
      reasoningSummary: `Finished; tracker id=${saved.id}`,
    });
    return { run };
  } catch (err) {
    if (err instanceof CancelError) {
      run.status = "cancelled";
      run.finishedAt = Date.now();
      await persistRun({});
      fsm.go("CANCELLED");
      sink.nextStep();
      await sink.record({
        kind: "state",
        name: "CANCELLED",
        status: "info",
        reasoningSummary: "Run cancelled by user",
      });
      return { run };
    }
    const msg = err instanceof Error ? err.message : String(err);
    run.status = "error";
    run.errorMessage = msg;
    run.finishedAt = Date.now();
    await persistRun({});
    fsm.go("ERROR");
    sink.nextStep();
    await sink.record({
      kind: "error",
      name: "orchestrator",
      status: "error",
      resultPreview: msg,
      reasoningSummary: "Run failed; see details",
    });
    return { run };
  }
}

class CancelError extends Error {
  constructor() {
    super("cancelled");
  }
}

async function finalizeEarlyIrrelevant(
  sink: ReturnType<typeof createTimelineSink>,
  fsm: StateMachine,
  run: RunRecord,
  persistRun: (p: Partial<RunRecord>) => Promise<void>,
) {
  sink.nextStep();
  await sink.record({
    kind: "info",
    name: "info",
    status: "info",
    reasoningSummary:
      "Classified as irrelevant page; stopping early to preserve Gemini budget.",
  });
  fsm.go("DONE");
  run.finalAnswer =
    "This page does not look like an opportunity. I stopped early to save Gemini budget. If you think this is wrong, use manual selection.";
  run.status = "done";
  run.finishedAt = Date.now();
  await persistRun({});
}

async function finalizeNoProfile(
  sink: ReturnType<typeof createTimelineSink>,
  fsm: StateMachine,
  run: RunRecord,
  persistRun: (p: Partial<RunRecord>) => Promise<void>,
) {
  sink.nextStep();
  await sink.record({
    kind: "info",
    name: "info",
    status: "info",
    reasoningSummary:
      "No candidate profile found. Stopping before any LLM call and asking user to create a profile.",
  });
  fsm.go("NEEDS_USER_INPUT");
  run.status = "needs_user_input";
  run.finalAnswer =
    "No profile summary found. Open Settings → Profile and create one, then run again.";
  run.finishedAt = Date.now();
  await persistRun({});
}

async function finalizeWithoutLlm(
  sink: ReturnType<typeof createTimelineSink>,
  fsm: StateMachine,
  run: RunRecord,
  persistRun: (p: Partial<RunRecord>) => Promise<void>,
) {
  sink.nextStep();
  await sink.record({
    kind: "info",
    name: "info",
    status: "info",
    reasoningSummary:
      "Max LLM calls configured to 0; returning deterministic analysis only.",
  });
  fsm.go("SAVE_TRACKER");
  run.status = "done";
  run.finishedAt = Date.now();
  await persistRun({});
}

function composeFinalAnswer(
  op: OpportunityFact,
  fit: RunRecord["fit"],
  analysis: RunRecord["llmAnalysis"],
  assets: RunRecord["assets"],
): string {
  const bits: string[] = [];
  bits.push(
    `Opportunity: ${op.title ?? "(untitled)"}${op.company ? " @ " + op.company : ""}`,
  );
  if (fit) {
    bits.push(`Deterministic fit: ${fit.score}/100`);
    if (fit.requiredSkillGaps.length)
      bits.push(`Gaps: ${fit.requiredSkillGaps.slice(0, 3).join(", ")}`);
  }
  if (analysis) {
    bits.push(`Recommendation: ${analysis.recommendation}`);
    if (analysis.fitExplanation)
      bits.push(`Why: ${analysis.fitExplanation}`);
  }
  if (assets) {
    bits.push("Drafted a short recruiter note and 3 tailored bullets.");
  }
  return bits.join("\n");
}

function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}

async function withLlmRetry<T>(
  maxAttempts: number,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/non-JSON|parse/i.test(msg) && i + 1 < maxAttempts) {
        continue; // retry on parse errors only
      }
      throw e;
    }
  }
  throw lastErr;
}

// Defensively export a PageSignals type for callers; no-op.
export type { PageSignals };
