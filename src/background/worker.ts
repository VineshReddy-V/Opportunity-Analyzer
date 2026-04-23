/**
 * Service worker entry.
 *
 * - Opens the side panel on toolbar click.
 * - Bootstraps settings + profile into memory on each cold start.
 * - Routes chrome.runtime messages from the side panel and content script.
 * - Drives the RunQueue, which in turn invokes the orchestrator.
 * - Broadcasts budget snapshots, tool events, and run updates to listeners.
 */

import { createLogger } from "@/shared/logger";
import {
  loadBudgetConfig,
  loadGeminiSettings,
} from "@/storage/chromeStorage";
import { budgetManager } from "./budgetManager";
import { runQueue, type QueueItem } from "./queueManager";
import { runOrchestrator } from "./orchestrator";
import { geminiAdapter } from "./geminiAdapter";
import {
  MSG,
  type BackgroundBroadcast,
  type CancelRunRequest,
  type CancelRunResponse,
  type DeleteTrackerRecordRequest,
  type DeleteTrackerRecordResponse,
  type GetActiveRunRequest,
  type GetActiveRunResponse,
  type GetBudgetConfigRequest,
  type GetBudgetConfigResponse,
  type GetProfileRequest,
  type GetProfileResponse,
  type GetQueueRequest,
  type GetQueueResponse,
  type GetRunRequest,
  type GetRunResponse,
  type GetSettingsRequest,
  type GetSettingsResponse,
  type GetToolEventsRequest,
  type GetToolEventsResponse,
  type ListRunsRequest,
  type ListRunsResponse,
  type ListTrackerRequest,
  type ListTrackerResponse,
  type SaveBudgetConfigRequest,
  type SaveBudgetConfigResponse,
  type SaveProfileRequest,
  type SaveProfileResponse,
  type SaveSettingsRequest,
  type SaveSettingsResponse,
  type StartRunRequest,
  type StartRunResponse,
  type UpdateTrackerStatusRequest,
  type UpdateTrackerStatusResponse,
} from "@/shared/messaging";
import {
  loadCandidateProfile,
  saveBudgetConfig,
  saveCandidateProfile,
  saveGeminiSettings,
} from "@/storage/chromeStorage";
import {
  deleteTrackerRecord,
  getRun,
  listRecentRuns,
  listToolEvents,
  listTracker,
  updateTrackerStatus,
} from "@/storage/stores";
import type { RunRecord, ToolEvent } from "@/shared/types";

const log = createLogger("worker");

// --- Side panel wiring ------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  log.info("onInstalled");
  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (e) {
    log.warn("sidePanel.setPanelBehavior failed", e);
  }
});

// Best-effort open on action click (older Chrome versions).
chrome.action?.onClicked?.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    log.warn("sidePanel.open failed", e);
  }
});

// --- Broadcast helpers ------------------------------------------------------

function broadcast(msg: BackgroundBroadcast) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      // Swallow "Receiving end does not exist" when side panel is closed.
      void chrome.runtime.lastError;
    });
  } catch (e) {
    log.debug("broadcast ignored", e);
  }
}

function broadcastBudget() {
  budgetManager.setQueuedRuns(runQueue.size());
  broadcast({ type: MSG.budgetSnapshot, snapshot: budgetManager.snapshot() });
}

// --- Run lifecycle tracking -------------------------------------------------

const cancelledRunIds = new Set<string>();

// --- Bootstrap --------------------------------------------------------------

async function bootstrap() {
  const [settings, budget] = await Promise.all([
    loadGeminiSettings(),
    loadBudgetConfig(),
  ]);
  geminiAdapter.setSettings(settings);
  budgetManager.setConfig(budget);
  budgetManager.setActiveModel(settings.primaryModel);
  broadcastBudget();
  log.info(
    "bootstrap ok. model=",
    settings.primaryModel,
    "rpm=",
    budget.rpm,
  );
}

runQueue.setOnChange(() => {
  broadcastBudget();
});

runQueue.setHandler(async (item: QueueItem) => {
  await bootstrap(); // reload settings in case they changed mid-queue
  const runId = item.runId;
  const result = await runOrchestrator(
    {
      runId,
      tabId: item.tabId,
      url: item.url,
      forceMinimal: !!item.forceMinimal,
      cancelSignal: () => cancelledRunIds.has(runId) || !!item.cancelled,
    },
    {
      onRunUpdate: (run: RunRecord) => {
        broadcast({ type: MSG.runUpdate, run });
      },
      onToolEvent: (ev: ToolEvent) => {
        broadcast({ type: MSG.toolEvent, event: ev });
      },
      onStateChange: () => broadcastBudget(),
    },
  );
  cancelledRunIds.delete(runId);
  broadcastBudget();
  return void result;
});

// Kick bootstrap immediately on service worker cold start.
void bootstrap();

// --- Message router ---------------------------------------------------------

type AnyMsg = { type: string } & Record<string, unknown>;
/** Narrow an AnyMsg to a specific request shape without triggering unsafe-cast lints. */
function narrow<T>(msg: AnyMsg): T {
  return msg as unknown as T;
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as AnyMsg;
  if (!msg?.type || typeof msg.type !== "string") return;

  // Handle message asynchronously; we return true to keep the channel open.
  (async () => {
    try {
      switch (msg.type) {
        case MSG.startRun: {
          const req = narrow<StartRunRequest>(msg);
          const runId = crypto.randomUUID();
          const { queued } = runQueue.enqueue({
            runId,
            tabId: req.tabId,
            url: req.url,
            enqueuedAt: Date.now(),
            forceMinimal: req.forceMinimal,
          });
          const resp: StartRunResponse = { ok: true, runId, queued };
          sendResponse(resp);
          broadcastBudget();
          return;
        }
        case MSG.cancelRun: {
          const req = narrow<CancelRunRequest>(msg);
          cancelledRunIds.add(req.runId);
          const ok = runQueue.cancel(req.runId);
          const resp: CancelRunResponse = { ok };
          sendResponse(resp);
          broadcastBudget();
          return;
        }
        case MSG.getActiveRun: {
          void narrow<GetActiveRunRequest>(msg);
          const active = runQueue.getActive();
          if (!active) {
            const r: GetActiveRunResponse = { ok: true };
            sendResponse(r);
            return;
          }
          const run = await getRun(active.runId);
          const r: GetActiveRunResponse = { ok: true, run };
          sendResponse(r);
          return;
        }
        case MSG.getQueue: {
          void narrow<GetQueueRequest>(msg);
          const snap = runQueue.getQueueSnapshot();
          const queued = snap.map((q) => ({
            runId: q.runId,
            url: q.url,
            status: q.cancelled ? "cancelled" : "queued",
          }));
          const r: GetQueueResponse = {
            ok: true,
            queued: queued as GetQueueResponse["queued"],
          };
          sendResponse(r);
          return;
        }
        case MSG.getSettings: {
          void narrow<GetSettingsRequest>(msg);
          const s = await loadGeminiSettings();
          sendResponse({ ok: true, settings: s } as GetSettingsResponse);
          return;
        }
        case MSG.saveSettings: {
          const req = narrow<SaveSettingsRequest>(msg);
          await saveGeminiSettings(req.settings);
          geminiAdapter.setSettings(req.settings);
          broadcastBudget();
          sendResponse({ ok: true } as SaveSettingsResponse);
          return;
        }
        case MSG.getProfile: {
          void narrow<GetProfileRequest>(msg);
          const profile = await loadCandidateProfile();
          sendResponse({ ok: true, profile } as GetProfileResponse);
          return;
        }
        case MSG.saveProfile: {
          const req = narrow<SaveProfileRequest>(msg);
          await saveCandidateProfile(req.profile);
          sendResponse({ ok: true } as SaveProfileResponse);
          return;
        }
        case MSG.getBudgetConfig: {
          void narrow<GetBudgetConfigRequest>(msg);
          const config = await loadBudgetConfig();
          sendResponse({ ok: true, config } as GetBudgetConfigResponse);
          return;
        }
        case MSG.saveBudgetConfig: {
          const req = narrow<SaveBudgetConfigRequest>(msg);
          await saveBudgetConfig(req.config);
          budgetManager.setConfig(req.config);
          broadcastBudget();
          sendResponse({ ok: true } as SaveBudgetConfigResponse);
          return;
        }
        case MSG.listTracker: {
          void narrow<ListTrackerRequest>(msg);
          const records = await listTracker();
          sendResponse({ ok: true, records } as ListTrackerResponse);
          return;
        }
        case MSG.updateTrackerStatus: {
          const req = narrow<UpdateTrackerStatusRequest>(msg);
          await updateTrackerStatus(req.id, req.status);
          sendResponse({ ok: true } as UpdateTrackerStatusResponse);
          return;
        }
        case MSG.deleteTrackerRecord: {
          const req = narrow<DeleteTrackerRecordRequest>(msg);
          await deleteTrackerRecord(req.id);
          sendResponse({ ok: true } as DeleteTrackerRecordResponse);
          return;
        }
        case MSG.getToolEvents: {
          const req = narrow<GetToolEventsRequest>(msg);
          const events = await listToolEvents(req.runId);
          sendResponse({ ok: true, events } as GetToolEventsResponse);
          return;
        }
        case MSG.getRun: {
          const req = narrow<GetRunRequest>(msg);
          const run = await getRun(req.runId);
          sendResponse({ ok: true, run } as GetRunResponse);
          return;
        }
        case MSG.listRuns: {
          const req = narrow<ListRunsRequest>(msg);
          const runs = await listRecentRuns(req.limit ?? 25);
          sendResponse({ ok: true, runs } as ListRunsResponse);
          return;
        }
        default:
          // Not one of ours — ignore.
          return;
      }
    } catch (e) {
      log.error("router error", e);
      try {
        sendResponse({ ok: false, error: errMsg(e) });
      } catch {
        /* ignore */
      }
    }
  })();
  return true; // keep sendResponse open
});

// Periodically refresh budget snapshot so the UI reflects rolling windows.
setInterval(() => {
  broadcastBudget();
}, 15_000);

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
