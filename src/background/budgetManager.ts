/**
 * GeminiBudgetManager
 *
 * Central authority on "should this LLM call be allowed right now?".
 *
 * Signals tracked:
 *   - RPM window (rolling 60s)
 *   - TPM window (rolling 60s) — approximate
 *   - RPD window (rolling 24h)
 *   - recent 429s
 *   - current agent mode (normal | minimal)
 *   - active backoff until a timestamp
 *
 * Decisions produced:
 *   - allow  -> caller may fire the request immediately
 *   - delay  -> caller must sleep `delayMs` and try again
 *   - downgrade -> switch to minimal mode, retry after
 *   - reject -> user-facing explanation, do not call
 *
 * Notes for free tier:
 *   - Defaults are conservative. Real published limits are not guaranteed.
 *   - We reserve a safety buffer (default 25%) from configured caps.
 *   - We force concurrency of 1 regardless of windows.
 */

import {
  DEFAULT_RPD,
  DEFAULT_RPM,
  DEFAULT_SAFETY_RESERVE_PCT,
  DEFAULT_TPM,
  GENERATION_DISABLED_THRESHOLD_PCT,
  MINIMAL_MODE_THRESHOLD_PCT,
} from "@/shared/constants";
import { addBudgetEvent } from "@/storage/stores";
import type {
  AgentMode,
  BudgetHealth,
  BudgetSnapshot,
  RateBudgetConfig,
} from "@/shared/types";
import { createLogger } from "@/shared/logger";

const log = createLogger("budget");

export type BudgetDecision =
  | { kind: "allow"; mode: AgentMode }
  | { kind: "delay"; delayMs: number; mode: AgentMode; reason: string }
  | { kind: "downgrade"; mode: "minimal"; reason: string }
  | { kind: "reject"; mode: AgentMode; reason: string };

interface RequestSample {
  ts: number;
  estimatedTokens: number;
}

export class GeminiBudgetManager {
  private config: RateBudgetConfig = {
    rpm: DEFAULT_RPM,
    tpm: DEFAULT_TPM,
    rpd: DEFAULT_RPD,
    safetyReservePct: DEFAULT_SAFETY_RESERVE_PCT,
    maxCallsPerRun: 3,
    autoMinimalMode: true,
  };

  private samples: RequestSample[] = [];
  private recent429s: number[] = [];
  private backoffUntil = 0;
  private inFlight = 0;
  private mode: AgentMode = "normal";
  private activeModel = "";
  private queuedRuns = 0;

  setConfig(cfg: RateBudgetConfig) {
    this.config = { ...cfg };
  }

  getConfig(): RateBudgetConfig {
    return { ...this.config };
  }

  setActiveModel(model: string) {
    this.activeModel = model;
  }

  setQueuedRuns(n: number) {
    this.queuedRuns = n;
  }

  private effectiveCap(raw: number): number {
    const reserve = 1 - this.config.safetyReservePct / 100;
    return Math.max(1, Math.floor(raw * reserve));
  }

  private prune(now: number) {
    const windowStart = now - 60_000;
    this.samples = this.samples.filter((s) => s.ts >= now - 24 * 3600_000);
    // Also evict very old 429s after 5 minutes.
    this.recent429s = this.recent429s.filter((ts) => now - ts < 5 * 60_000);
    // Nothing else to do — keep all RPM samples but compute windowed on demand.
    void windowStart;
  }

  private windowUsage(now: number) {
    const minuteAgo = now - 60_000;
    const dayAgo = now - 24 * 3600_000;
    let rpmCount = 0;
    let tpmCount = 0;
    let rpdCount = 0;
    for (const s of this.samples) {
      if (s.ts >= minuteAgo) {
        rpmCount += 1;
        tpmCount += s.estimatedTokens;
      }
      if (s.ts >= dayAgo) rpdCount += 1;
    }
    return { rpmCount, tpmCount, rpdCount };
  }

  /**
   * Decide whether a new LLM call is allowed RIGHT NOW.
   *
   * `estimatedTokens` should include the rough prompt + generation budget.
   */
  async shouldAllowCall(estimatedTokens: number): Promise<BudgetDecision> {
    const now = Date.now();
    this.prune(now);

    // Hard single-flight: only one in-flight request at a time.
    if (this.inFlight > 0) {
      return {
        kind: "delay",
        mode: this.mode,
        delayMs: 350,
        reason: "Another Gemini call is already in flight",
      };
    }

    // Active backoff window.
    if (now < this.backoffUntil) {
      return {
        kind: "delay",
        mode: this.mode,
        delayMs: this.backoffUntil - now,
        reason: "Backing off after recent rate limit",
      };
    }

    const cap = {
      rpm: this.effectiveCap(this.config.rpm),
      tpm: this.effectiveCap(this.config.tpm),
      rpd: this.effectiveCap(this.config.rpd),
    };
    const used = this.windowUsage(now);

    // Hard stops when we've exceeded the effective daily cap.
    if (used.rpdCount >= cap.rpd) {
      await addBudgetEvent({
        timestamp: now,
        kind: "decision",
        detail: "daily budget reached",
      });
      return {
        kind: "reject",
        mode: this.mode,
        reason:
          "Daily Gemini request budget reached. Try again tomorrow or raise the RPD in Settings.",
      };
    }

    // If we're one RPM cap away, force a delay rather than burst.
    if (used.rpmCount >= cap.rpm) {
      return {
        kind: "delay",
        mode: this.mode,
        delayMs: 3_000,
        reason: "RPM cap hit; pacing requests",
      };
    }
    if (used.tpmCount + estimatedTokens >= cap.tpm) {
      return {
        kind: "delay",
        mode: this.mode,
        delayMs: 5_000,
        reason: "TPM cap approaching; pacing",
      };
    }

    // Soft modulations based on overall usage percentage.
    const usagePct =
      Math.max(
        used.rpmCount / cap.rpm,
        used.tpmCount / cap.tpm,
        used.rpdCount / cap.rpd,
      ) * 100;

    // Prefer downgrade over delay when budget is tight AND user allowed it.
    if (
      this.config.autoMinimalMode &&
      this.mode === "normal" &&
      usagePct >= MINIMAL_MODE_THRESHOLD_PCT
    ) {
      this.mode = "minimal";
      await addBudgetEvent({
        timestamp: now,
        kind: "decision",
        detail: `usage ${usagePct.toFixed(1)}% — downgrade to minimal`,
        mode: "minimal",
      });
      return {
        kind: "downgrade",
        mode: "minimal",
        reason:
          "Gemini budget is ~70%+ used. Downgrading to minimal mode (2 calls/run).",
      };
    }

    return { kind: "allow", mode: this.mode };
  }

  /** Should we skip optional generation entirely? */
  shouldSkipOptionalGeneration(): boolean {
    const now = Date.now();
    const cap = {
      rpm: this.effectiveCap(this.config.rpm),
      tpm: this.effectiveCap(this.config.tpm),
      rpd: this.effectiveCap(this.config.rpd),
    };
    const used = this.windowUsage(now);
    const usagePct =
      Math.max(
        used.rpmCount / cap.rpm,
        used.tpmCount / cap.tpm,
        used.rpdCount / cap.rpd,
      ) * 100;
    return usagePct >= GENERATION_DISABLED_THRESHOLD_PCT;
  }

  /** Inform the budget manager that a call is starting. */
  onRequestStart(estimatedTokens: number) {
    this.inFlight += 1;
    this.samples.push({ ts: Date.now(), estimatedTokens });
  }

  /** Inform the budget manager that a call finished (success or failure). */
  onRequestEnd() {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  /** Register a 429 / RESOURCE_EXHAUSTED event and set a backoff window. */
  async onRateLimit(attempt: number): Promise<number> {
    const now = Date.now();
    this.recent429s.push(now);
    // Exponential backoff with jitter, capped at 60s.
    const base = 2_000 * Math.pow(2, Math.min(attempt, 5));
    const jitter = Math.floor(Math.random() * 1_500);
    const delay = Math.min(base + jitter, 60_000);
    this.backoffUntil = Math.max(this.backoffUntil, now + delay);
    // Force minimal mode after a rate limit to protect the next run.
    if (this.mode === "normal") this.mode = "minimal";
    await addBudgetEvent({
      timestamp: now,
      kind: "429",
      detail: `rate limit; backoff ${delay}ms`,
      mode: this.mode,
    });
    log.warn("Gemini 429. Backoff", delay, "ms");
    return delay;
  }

  resetModeToNormal() {
    this.mode = "normal";
  }

  getMode(): AgentMode {
    return this.mode;
  }

  /** Compose a user-facing snapshot for the side panel UI. */
  snapshot(): BudgetSnapshot {
    const now = Date.now();
    this.prune(now);
    const cap = {
      rpm: this.effectiveCap(this.config.rpm),
      tpm: this.effectiveCap(this.config.tpm),
      rpd: this.effectiveCap(this.config.rpd),
    };
    const used = this.windowUsage(now);
    const rpmUsedPct = Math.min(100, (used.rpmCount / cap.rpm) * 100);
    const tpmUsedPct = Math.min(100, (used.tpmCount / cap.tpm) * 100);
    const rpdUsedPct = Math.min(100, (used.rpdCount / cap.rpd) * 100);

    const maxPct = Math.max(rpmUsedPct, tpmUsedPct, rpdUsedPct);
    let health: BudgetHealth = "healthy";
    if (maxPct >= 85) health = "exhausted";
    else if (maxPct >= 60) health = "constrained";

    return {
      mode: this.mode,
      health,
      rpmUsedPct,
      tpmUsedPct,
      rpdUsedPct,
      activeModel: this.activeModel,
      queuedRuns: this.queuedRuns,
      recent429: this.recent429s.length > 0,
      backoffUntil: this.backoffUntil > now ? this.backoffUntil : undefined,
    };
  }
}

// Singleton instance for the service worker lifetime.
export const budgetManager = new GeminiBudgetManager();
