/**
 * Gemini Adapter
 *
 * Single choke point for all Gemini calls.
 * Responsibilities:
 *   - Talk to generativelanguage.googleapis.com v1beta `generateContent`
 *   - Enforce strict JSON output via `responseMimeType: application/json`
 *   - Integrate with `GeminiBudgetManager` for allow/delay/reject decisions
 *   - Retry with exponential backoff + jitter on 429/5xx
 *   - Fall back to secondary model on persistent failure
 *   - Support mock mode for local/demo testing without network calls
 */

import { createLogger } from "@/shared/logger";
import {
  MAX_GEMINI_RETRIES,
} from "@/shared/constants";
import { estimateTokens } from "@/shared/tokenEstimation";
import { sleep } from "@/shared/timeouts";
import { addBudgetEvent } from "@/storage/stores";
import type { GeminiSettings } from "@/shared/types";
import { budgetManager } from "./budgetManager";

const log = createLogger("gemini");

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiCallArgs {
  /** Fully-composed prompt text. */
  prompt: string;
  /** Approximate output token budget; we keep this low. */
  maxOutputTokens?: number;
  /** 0 for deterministic JSON; 0.2 is a reasonable default. */
  temperature?: number;
  /** Where this call came from, purely for logging. */
  callLabel: "plan_analyze" | "generate_assets";
}

export interface GeminiCallResult {
  text: string;
  model: string;
  promptTokens: number;
  candidatesTokens: number;
  mode: "live" | "mock";
}

/** Sanitize errors for UI. No raw API keys or full URLs. */
function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/key=[^&\s]+/gi, "key=***").slice(0, 400);
}

function extractText(json: any): string {
  const parts =
    json?.candidates?.[0]?.content?.parts ??
    json?.candidates?.[0]?.content ??
    [];
  if (Array.isArray(parts)) {
    return parts
      .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
      .join("")
      .trim();
  }
  return "";
}

function extractRetryDelaySeconds(body: any): number | undefined {
  try {
    const details = body?.error?.details ?? [];
    for (const d of details) {
      const t = d?.["@type"] ?? d?.type;
      if (typeof t === "string" && t.includes("RetryInfo")) {
        const s = d?.retryDelay as string | undefined;
        if (s && s.endsWith("s")) {
          const n = parseFloat(s.slice(0, -1));
          if (Number.isFinite(n)) return n;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export class GeminiAdapter {
  private settings: GeminiSettings = {
    apiKey: "",
    primaryModel: "gemini-2.5-flash-lite",
    fallbackModel: "gemini-2.5-flash",
    mockMode: false,
  };

  setSettings(s: GeminiSettings) {
    this.settings = { ...s };
    budgetManager.setActiveModel(this.settings.primaryModel);
  }

  getSettings(): GeminiSettings {
    return { ...this.settings };
  }

  /**
   * Make a single Gemini call, respecting budget manager and backoff.
   */
  async call(args: GeminiCallArgs): Promise<GeminiCallResult> {
    if (this.settings.mockMode) {
      const mockText = this.mockResponseFor(args.callLabel);
      return {
        text: mockText,
        model: "mock",
        promptTokens: estimateTokens(args.prompt),
        candidatesTokens: estimateTokens(mockText),
        mode: "mock",
      };
    }

    if (!this.settings.apiKey) {
      throw new Error(
        "Gemini API key is not set. Open Settings and paste your Google AI Studio key.",
      );
    }

    const estTokens =
      estimateTokens(args.prompt) + (args.maxOutputTokens ?? 400);

    // Block / delay / downgrade per the budget manager.
    for (let gate = 0; gate < 8; gate += 1) {
      const decision = await budgetManager.shouldAllowCall(estTokens);
      if (decision.kind === "allow") break;
      if (decision.kind === "reject") {
        throw new Error(decision.reason);
      }
      if (decision.kind === "downgrade") {
        await addBudgetEvent({
          timestamp: Date.now(),
          kind: "decision",
          detail: decision.reason,
          mode: decision.mode,
        });
        break; // still allowed to call, just in minimal mode
      }
      if (decision.kind === "delay") {
        log.info("budget delay", decision.delayMs, decision.reason);
        await sleep(decision.delayMs);
      }
    }

    return this.callInternal(args, this.settings.primaryModel, 0, true);
  }

  private async callInternal(
    args: GeminiCallArgs,
    model: string,
    attempt: number,
    allowFallback: boolean,
  ): Promise<GeminiCallResult> {
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.settings.apiKey)}`;
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: args.prompt }],
        },
      ],
      generationConfig: {
        temperature: args.temperature ?? 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: args.maxOutputTokens ?? 600,
      },
    };

    budgetManager.onRequestStart(
      estimateTokens(args.prompt) + (args.maxOutputTokens ?? 400),
    );

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 503) {
        let bodyJson: any = undefined;
        try {
          bodyJson = await res.json();
        } catch {
          /* ignore */
        }
        const retryHintSec = extractRetryDelaySeconds(bodyJson);
        budgetManager.onRequestEnd();
        const backoff = await budgetManager.onRateLimit(attempt);
        const waitMs = retryHintSec
          ? Math.max(backoff, Math.ceil(retryHintSec * 1000))
          : backoff;
        if (attempt + 1 >= MAX_GEMINI_RETRIES) {
          if (allowFallback && this.settings.fallbackModel !== model) {
            log.warn(
              "Primary exhausted, trying fallback model",
              this.settings.fallbackModel,
            );
            await sleep(waitMs);
            return this.callInternal(
              args,
              this.settings.fallbackModel,
              0,
              false,
            );
          }
          throw new Error(
            `Gemini rate limited after retries (HTTP ${res.status}). Try again shortly.`,
          );
        }
        await sleep(waitMs);
        return this.callInternal(args, model, attempt + 1, allowFallback);
      }

      if (!res.ok) {
        let bodyText: string = "";
        try {
          bodyText = await res.text();
        } catch {
          /* ignore */
        }
        budgetManager.onRequestEnd();
        await addBudgetEvent({
          timestamp: Date.now(),
          kind: "call_err",
          detail: `HTTP ${res.status}: ${bodyText.slice(0, 200)}`,
        });
        throw new Error(
          `Gemini HTTP ${res.status}: ${sanitizeError(bodyText)}`,
        );
      }

      const json = await res.json();
      budgetManager.onRequestEnd();
      const text = extractText(json);
      const promptTokens =
        json?.usageMetadata?.promptTokenCount ??
        estimateTokens(args.prompt);
      const candidatesTokens =
        json?.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);
      await addBudgetEvent({
        timestamp: Date.now(),
        kind: "call_ok",
        detail: `${args.callLabel} via ${model} ok (${promptTokens}p/${candidatesTokens}c)`,
      });
      return {
        text,
        model,
        promptTokens,
        candidatesTokens,
        mode: "live",
      };
    } catch (err) {
      budgetManager.onRequestEnd();
      if (attempt + 1 < MAX_GEMINI_RETRIES) {
        const wait = await budgetManager.onRateLimit(attempt);
        await sleep(wait);
        return this.callInternal(args, model, attempt + 1, allowFallback);
      }
      throw new Error(`Gemini call failed: ${sanitizeError(err)}`);
    }
  }

  /** Minimal deterministic mock for demo/testing without an API key. */
  private mockResponseFor(label: string): string {
    if (label === "plan_analyze") {
      return JSON.stringify({
        fitExplanation:
          "Mock analysis: the candidate has strong overlap on core required skills with a few minor gaps in preferred tools.",
        strengths: [
          "Core required skills present",
          "Relevant project experience",
          "Target role alignment",
        ],
        gaps: ["One preferred tool missing", "Domain-specific keyword missing"],
        recommendation: "tailor_then_apply",
        needsGeneration: true,
        reasoningSummary:
          "Deterministic fit was moderate; LLM explanation supports tailor-then-apply.",
      });
    }
    if (label === "generate_assets") {
      return JSON.stringify({
        recruiterNote:
          "Hi team — I noticed the listed requirement around building production data pipelines, which closely mirrors the work I did last year on a cross-team analytics project. I'd love to discuss how I could contribute to your roadmap.",
        applicationSummary:
          "Experienced engineer with strong overlap on the stated required skills. Happy to share relevant work samples and discuss the role's priorities.",
        tailoredBullets: [
          "Shipped a production pipeline matching the required stack with measurable impact.",
          "Led a cross-functional project similar in scope to the role's responsibilities.",
          "Familiar with the preferred tools and actively closing the remaining gap.",
        ],
        producedIn: "normal",
      });
    }
    return "{}";
  }
}

export const geminiAdapter = new GeminiAdapter();
