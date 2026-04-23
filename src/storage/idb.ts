/**
 * IndexedDB schema using Dexie.
 *
 * This is the persistent, local-only store for all runtime agent data:
 * tracker records, run records, tool/timeline events, page snapshots,
 * generated asset drafts, cache entries, and budget events.
 *
 * All data stays on-device; nothing here is synced to a backend.
 */

import Dexie, { type Table } from "dexie";
import { DB_NAME, DB_VERSION } from "@/shared/constants";
import type {
  BudgetEvent,
  CacheEntry,
  DraftAsset,
  PageSnapshot,
  RunRecord,
  ToolEvent,
  TrackerRecord,
} from "@/shared/types";

export class OpportunityDB extends Dexie {
  tracker_records!: Table<TrackerRecord, string>;
  runs!: Table<RunRecord, string>;
  tool_events!: Table<ToolEvent, number>;
  page_snapshots!: Table<PageSnapshot, number>;
  draft_assets!: Table<DraftAsset, number>;
  cache_entries!: Table<CacheEntry, number>;
  budget_events!: Table<BudgetEvent, number>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      // id is the primary key; extra indices in parens.
      tracker_records:
        "id, urlKey, [urlKey+titleKey+companyKey], status, updatedAt",
      runs: "id, tabId, url, hostname, startedAt, status",
      tool_events: "++id, runId, timestamp, kind",
      page_snapshots: "++id, runId, url, contentHash, createdAt",
      draft_assets: "++id, runId, trackerId, createdAt",
      cache_entries: "++id, &key, createdAt",
      budget_events: "++id, timestamp, kind",
    });
  }
}

let _db: OpportunityDB | null = null;
export function getDb(): OpportunityDB {
  if (!_db) {
    _db = new OpportunityDB();
  }
  return _db;
}
