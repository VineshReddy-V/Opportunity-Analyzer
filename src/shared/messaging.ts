/**
 * Messaging contract between side panel <-> background service worker
 * <-> content script. Keep this file the single source of truth so we
 * never get drift between senders and receivers.
 */

import { MSG_PREFIX } from "./constants";
import type {
  BudgetSnapshot,
  CandidateProfileSummary,
  GeminiSettings,
  GeneratedAssets,
  OpportunityFact,
  PageSignals,
  RateBudgetConfig,
  RunRecord,
  RunStatus,
  ToolEvent,
  TrackerRecord,
  TrackerStatus,
} from "./types";

/** Type-safe factory to namespace messages. */
const t = <K extends string>(k: K) => `${MSG_PREFIX}${k}` as const;

export const MSG = {
  startRun: t("startRun"),
  cancelRun: t("cancelRun"),
  getActiveRun: t("getActiveRun"),
  getQueue: t("getQueue"),
  subscribeUpdates: t("subscribeUpdates"),
  unsubscribeUpdates: t("unsubscribeUpdates"),
  budgetSnapshot: t("budgetSnapshot"),
  runUpdate: t("runUpdate"),
  toolEvent: t("toolEvent"),
  // Settings and profile
  getSettings: t("getSettings"),
  saveSettings: t("saveSettings"),
  getProfile: t("getProfile"),
  saveProfile: t("saveProfile"),
  getBudgetConfig: t("getBudgetConfig"),
  saveBudgetConfig: t("saveBudgetConfig"),
  // Tracker
  listTracker: t("listTracker"),
  updateTrackerStatus: t("updateTrackerStatus"),
  deleteTrackerRecord: t("deleteTrackerRecord"),
  // Content script messages
  contentClassify: t("contentClassify"),
  contentExtract: t("contentExtract"),
  contentManualSelect: t("contentManualSelect"),
  // Runs / timeline
  getRun: t("getRun"),
  listRuns: t("listRuns"),
  getToolEvents: t("getToolEvents"),
} as const;

export type MsgName = (typeof MSG)[keyof typeof MSG];

// --- Request/Response types -------------------------------------------------

export interface StartRunRequest {
  type: typeof MSG.startRun;
  tabId: number;
  url: string;
  forceMinimal?: boolean;
}
export interface StartRunResponse {
  ok: boolean;
  runId?: string;
  queued?: boolean;
  error?: string;
}

export interface CancelRunRequest {
  type: typeof MSG.cancelRun;
  runId: string;
}
export interface CancelRunResponse {
  ok: boolean;
  error?: string;
}

export interface GetActiveRunRequest {
  type: typeof MSG.getActiveRun;
}
export interface GetActiveRunResponse {
  ok: boolean;
  run?: RunRecord;
}

export interface GetQueueRequest {
  type: typeof MSG.getQueue;
}
export interface GetQueueResponse {
  ok: boolean;
  queued: { runId: string; url: string; status: RunStatus }[];
}

export interface GetSettingsRequest {
  type: typeof MSG.getSettings;
}
export interface GetSettingsResponse {
  ok: boolean;
  settings: GeminiSettings;
}

export interface SaveSettingsRequest {
  type: typeof MSG.saveSettings;
  settings: GeminiSettings;
}
export interface SaveSettingsResponse {
  ok: boolean;
  error?: string;
}

export interface GetProfileRequest {
  type: typeof MSG.getProfile;
}
export interface GetProfileResponse {
  ok: boolean;
  profile?: CandidateProfileSummary;
}

export interface SaveProfileRequest {
  type: typeof MSG.saveProfile;
  profile: CandidateProfileSummary;
}
export interface SaveProfileResponse {
  ok: boolean;
  error?: string;
}

export interface GetBudgetConfigRequest {
  type: typeof MSG.getBudgetConfig;
}
export interface GetBudgetConfigResponse {
  ok: boolean;
  config: RateBudgetConfig;
}

export interface SaveBudgetConfigRequest {
  type: typeof MSG.saveBudgetConfig;
  config: RateBudgetConfig;
}
export interface SaveBudgetConfigResponse {
  ok: boolean;
  error?: string;
}

export interface ListTrackerRequest {
  type: typeof MSG.listTracker;
}
export interface ListTrackerResponse {
  ok: boolean;
  records: TrackerRecord[];
}

export interface UpdateTrackerStatusRequest {
  type: typeof MSG.updateTrackerStatus;
  id: string;
  status: TrackerStatus;
}
export interface UpdateTrackerStatusResponse {
  ok: boolean;
  error?: string;
}

export interface DeleteTrackerRecordRequest {
  type: typeof MSG.deleteTrackerRecord;
  id: string;
}
export interface DeleteTrackerRecordResponse {
  ok: boolean;
  error?: string;
}

export interface GetToolEventsRequest {
  type: typeof MSG.getToolEvents;
  runId: string;
}
export interface GetToolEventsResponse {
  ok: boolean;
  events: ToolEvent[];
}

export interface GetRunRequest {
  type: typeof MSG.getRun;
  runId: string;
}
export interface GetRunResponse {
  ok: boolean;
  run?: RunRecord;
}

export interface ListRunsRequest {
  type: typeof MSG.listRuns;
  limit?: number;
}
export interface ListRunsResponse {
  ok: boolean;
  runs: RunRecord[];
}

// --- Content script I/O -----------------------------------------------------

export interface ContentClassifyRequest {
  type: typeof MSG.contentClassify;
}
export interface ContentClassifyResponse {
  ok: boolean;
  signals?: PageSignals;
  pageType?:
    | "opportunity_detail"
    | "opportunity_listing"
    | "company_page"
    | "unknown"
    | "irrelevant";
  error?: string;
}

export interface ContentExtractRequest {
  type: typeof MSG.contentExtract;
  /** If true, allow adapter-specific deep extraction; otherwise generic. */
  allowAdapters: boolean;
}
export interface ContentExtractResponse {
  ok: boolean;
  opportunity?: OpportunityFact;
  error?: string;
}

export interface ContentManualSelectRequest {
  type: typeof MSG.contentManualSelect;
}
export interface ContentManualSelectResponse {
  ok: boolean;
  selectedText?: string;
  error?: string;
}

// --- Broadcast (background -> side panel) -----------------------------------

export interface RunUpdateBroadcast {
  type: typeof MSG.runUpdate;
  run: RunRecord;
}

export interface ToolEventBroadcast {
  type: typeof MSG.toolEvent;
  event: ToolEvent;
}

export interface BudgetSnapshotBroadcast {
  type: typeof MSG.budgetSnapshot;
  snapshot: BudgetSnapshot;
}

export type BackgroundBroadcast =
  | RunUpdateBroadcast
  | ToolEventBroadcast
  | BudgetSnapshotBroadcast;

// Re-export the types module alias for convenience.
export type {
  GeneratedAssets,
  OpportunityFact,
  PageSignals,
  RunRecord,
  ToolEvent,
  TrackerRecord,
  BudgetSnapshot,
};
