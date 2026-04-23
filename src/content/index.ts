/**
 * Content script entry point.
 *
 * The content script is injected ON DEMAND by the service worker via
 * chrome.scripting.executeScript (see orchestrator.ts). It does nothing
 * proactively — only responds to messages.
 *
 * This satisfies two goals:
 *   - "Inject content scripts only on demand" (spec §4.1 #3)
 *   - "No continuous scraping" (spec §4.1 #1)
 */

import {
  DOM_STABILITY_MS,
  DOM_STABILITY_MAX_MS,
} from "@/shared/constants";
import { MSG } from "@/shared/messaging";
import { classifyPage } from "./classifier";
import {
  extractFromManualText,
  extractOpportunity,
} from "./extractor";
import { getSelectionOrEmpty } from "./manualSelection";
import { createLogger } from "@/shared/logger";

const log = createLogger("content");

// Idempotency guard: multiple executeScript calls shouldn't re-register.
const key = "__oaContentInstalled";
const g = window as unknown as Record<string, unknown>;
if (!g[key]) {
  g[key] = true;

  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as { type?: string };
    if (!msg?.type) return;
    (async () => {
      try {
        switch (msg.type) {
          case MSG.contentClassify: {
            await waitForDomStability();
            const { pageType, signals } = classifyPage();
            sendResponse({ ok: true, pageType, signals });
            return;
          }
          case MSG.contentExtract: {
            await waitForDomStability();
            const selection = getSelectionOrEmpty();
            const op =
              selection.length > 200
                ? extractFromManualText(selection)
                : extractOpportunity();
            sendResponse({ ok: true, opportunity: op });
            return;
          }
          case MSG.contentManualSelect: {
            const selection = getSelectionOrEmpty();
            sendResponse({ ok: true, selectedText: selection });
            return;
          }
          default:
            return;
        }
      } catch (e) {
        log.warn("content error", e);
        try {
          sendResponse({ ok: false, error: errMsg(e) });
        } catch {
          /* ignore */
        }
      }
    })();
    return true;
  });

  log.info("content script ready");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Wait a short, bounded window for the DOM to stop mutating — useful for
 * SPAs like LinkedIn/Workday that swap the job description in asynchronously.
 */
async function waitForDomStability(): Promise<void> {
  return new Promise((resolve) => {
    let lastMutation = Date.now();
    let resolved = false;
    const start = Date.now();
    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });
    try {
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch {
      // Some docs reject observers; just resolve.
      return resolve();
    }

    const tick = () => {
      if (resolved) return;
      if (Date.now() - lastMutation > DOM_STABILITY_MS) {
        resolved = true;
        observer.disconnect();
        return resolve();
      }
      if (Date.now() - start > DOM_STABILITY_MAX_MS) {
        resolved = true;
        observer.disconnect();
        return resolve();
      }
      setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
  });
}
