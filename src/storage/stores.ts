/**
 * Thin helpers on top of Dexie tables. Keep these small and predictable;
 * callers may also use `getDb().<table>` directly when they need
 * something not covered here.
 */

import { getDb } from "./idb";
import { normalizeName, normalizeUrl } from "@/shared/hashing";
import type {
  BudgetEvent,
  CacheEntry,
  DraftAsset,
  OpportunityFact,
  PageSnapshot,
  RunRecord,
  ToolEvent,
  TrackerRecord,
  TrackerStatus,
} from "@/shared/types";

// --- Runs -------------------------------------------------------------------

export async function putRun(run: RunRecord): Promise<void> {
  await getDb().runs.put(run);
}

export async function getRun(id: string): Promise<RunRecord | undefined> {
  return getDb().runs.get(id);
}

export async function listRecentRuns(limit = 25): Promise<RunRecord[]> {
  return getDb()
    .runs.orderBy("startedAt")
    .reverse()
    .limit(limit)
    .toArray();
}

// --- Tool events ------------------------------------------------------------

export async function addToolEvent(ev: ToolEvent): Promise<number> {
  return (await getDb().tool_events.add(ev)) as number;
}

export async function listToolEvents(runId: string): Promise<ToolEvent[]> {
  return getDb()
    .tool_events.where("runId")
    .equals(runId)
    .sortBy("timestamp");
}

// --- Budget events ----------------------------------------------------------

export async function addBudgetEvent(ev: BudgetEvent): Promise<void> {
  await getDb().budget_events.add(ev);
  // Trim old budget events to keep DB small. Keep last 500.
  const count = await getDb().budget_events.count();
  if (count > 500) {
    const excess = count - 500;
    const oldest = await getDb()
      .budget_events.orderBy("timestamp")
      .limit(excess)
      .primaryKeys();
    await getDb().budget_events.bulkDelete(oldest);
  }
}

export async function listRecentBudgetEvents(
  sinceMs: number,
): Promise<BudgetEvent[]> {
  const cutoff = Date.now() - sinceMs;
  return getDb()
    .budget_events.where("timestamp")
    .above(cutoff)
    .toArray();
}

// --- Page snapshots ---------------------------------------------------------

export async function addPageSnapshot(snap: PageSnapshot): Promise<void> {
  await getDb().page_snapshots.add(snap);
}

// --- Draft assets -----------------------------------------------------------

export async function addDraftAsset(d: DraftAsset): Promise<void> {
  await getDb().draft_assets.add(d);
}

// --- Cache ------------------------------------------------------------------

export async function getCachedOpportunity(
  key: string,
): Promise<OpportunityFact | undefined> {
  const entry = await getDb().cache_entries.where("key").equals(key).first();
  return entry?.opportunity;
}

export async function putCachedOpportunity(entry: CacheEntry): Promise<void> {
  const existing = await getDb()
    .cache_entries.where("key")
    .equals(entry.key)
    .first();
  if (existing?.id !== undefined) {
    // Use put() instead of update() because update() requires a partial
    // (UpdateSpec) and strict typing rejects the full object. put() with
    // the preserved id performs an upsert semantics identical to what we
    // want here.
    await getDb().cache_entries.put({ ...entry, id: existing.id });
  } else {
    await getDb().cache_entries.add(entry);
  }
}

// --- Tracker ----------------------------------------------------------------

export async function listTracker(): Promise<TrackerRecord[]> {
  return getDb()
    .tracker_records.orderBy("updatedAt")
    .reverse()
    .toArray();
}

export async function upsertTrackerRecord(
  rec: TrackerRecord,
): Promise<TrackerRecord> {
  const db = getDb();
  const urlKey = normalizeUrl(rec.url);
  const titleKey = normalizeName(rec.title);
  const companyKey = normalizeName(rec.company);

  // Prefer URL match; fall back to title+company match for tricky SPAs.
  const byUrl = await db.tracker_records
    .where("urlKey")
    .equals(urlKey)
    .first();

  const existing =
    byUrl ??
    (titleKey && companyKey
      ? await db.tracker_records
          .where("[urlKey+titleKey+companyKey]")
          .equals([urlKey, titleKey, companyKey])
          .first()
      : undefined);

  const merged: TrackerRecord = existing
    ? {
        ...existing,
        ...rec,
        id: existing.id,
        urlKey,
        titleKey,
        companyKey,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      }
    : {
        ...rec,
        urlKey,
        titleKey,
        companyKey,
        createdAt: rec.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

  await db.tracker_records.put(merged);
  return merged;
}

export async function updateTrackerStatus(
  id: string,
  status: TrackerStatus,
): Promise<void> {
  await getDb()
    .tracker_records.update(id, { status, updatedAt: Date.now() });
}

export async function deleteTrackerRecord(id: string): Promise<void> {
  await getDb().tracker_records.delete(id);
}
