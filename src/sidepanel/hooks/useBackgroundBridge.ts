/**
 * React hook that exposes a typed bridge to the background service worker.
 *
 * - Sends messages via chrome.runtime.sendMessage
 * - Subscribes to broadcasts (run updates, tool events, budget snapshots)
 * - Keeps local React state in sync
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MSG,
  type BudgetSnapshot,
  type RunRecord,
  type ToolEvent,
} from "@/shared/messaging";
import { createLogger } from "@/shared/logger";

const log = createLogger("bridge");

type Broadcast =
  | { type: typeof MSG.runUpdate; run: RunRecord }
  | { type: typeof MSG.toolEvent; event: ToolEvent }
  | { type: typeof MSG.budgetSnapshot; snapshot: BudgetSnapshot };

export function sendMessage<TReq extends object, TResp>(
  msg: TReq,
): Promise<TResp> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (resp: TResp) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) reject(new Error(lastErr.message));
        else resolve(resp);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export interface BridgeState {
  budget?: BudgetSnapshot;
  activeRun?: RunRecord;
  lastEvent?: ToolEvent;
}

export function useBackgroundBridge() {
  const [budget, setBudget] = useState<BudgetSnapshot | undefined>(undefined);
  const [activeRun, setActiveRun] = useState<RunRecord | undefined>(undefined);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const runIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const listener = (raw: unknown) => {
      const m = raw as Broadcast | undefined;
      if (!m || typeof m !== "object") return;
      if (m.type === MSG.budgetSnapshot) {
        setBudget(m.snapshot);
      } else if (m.type === MSG.runUpdate) {
        setActiveRun(m.run);
        if (m.run.id !== runIdRef.current) {
          runIdRef.current = m.run.id;
          setToolEvents([]);
        }
      } else if (m.type === MSG.toolEvent) {
        setToolEvents((prev) => {
          // Keep events for the current run only.
          if (m.event.runId !== runIdRef.current) {
            runIdRef.current = m.event.runId;
            return [m.event];
          }
          return [...prev, m.event];
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const startRun = useCallback(
    async (tabId: number, url: string, forceMinimal = false) => {
      setToolEvents([]);
      const resp = await sendMessage<
        { type: string; tabId: number; url: string; forceMinimal?: boolean },
        { ok: boolean; runId?: string; queued?: boolean; error?: string }
      >({ type: MSG.startRun, tabId, url, forceMinimal });
      if (!resp.ok) throw new Error(resp.error ?? "startRun failed");
      runIdRef.current = resp.runId;
      return resp;
    },
    [],
  );

  const cancelRun = useCallback(async (runId: string) => {
    return sendMessage<
      { type: string; runId: string },
      { ok: boolean; error?: string }
    >({ type: MSG.cancelRun, runId });
  }, []);

  const refreshActive = useCallback(async () => {
    try {
      const resp = await sendMessage<
        { type: string },
        { ok: boolean; run?: RunRecord }
      >({ type: MSG.getActiveRun });
      if (resp.ok && resp.run) {
        setActiveRun(resp.run);
        runIdRef.current = resp.run.id;
      }
    } catch (e) {
      log.warn("refreshActive failed", e);
    }
  }, []);

  return {
    budget,
    activeRun,
    toolEvents,
    startRun,
    cancelRun,
    refreshActive,
    setActiveRun,
  };
}
