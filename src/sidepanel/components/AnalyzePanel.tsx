/**
 * AnalyzePanel — primary "run" UI.
 * - Show current tab URL
 * - Start/cancel buttons
 * - Show live status / mode / errors
 */
import React, { useEffect, useState } from "react";
import type { RunRecord } from "@/shared/messaging";

interface Props {
  activeRun?: RunRecord;
  onStart: (tabId: number, url: string, forceMinimal: boolean) => Promise<void>;
  onCancel: (runId: string) => Promise<void>;
}

export function AnalyzePanel({ activeRun, onStart, onCancel }: Props) {
  const [tabId, setTabId] = useState<number | undefined>(undefined);
  const [url, setUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [minimal, setMinimal] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const query = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) setTabId(tab.id);
        if (tab?.url) setUrl(tab.url);
      } catch {
        /* ignore */
      }
    };
    void query();
    // refresh when tab changes
    const listener = () => query();
    chrome.tabs.onActivated.addListener(listener);
    chrome.tabs.onUpdated.addListener(listener);
    return () => {
      chrome.tabs.onActivated.removeListener(listener);
      chrome.tabs.onUpdated.removeListener(listener);
    };
  }, []);

  const running =
    activeRun?.status === "running" ||
    activeRun?.status === "queued" ||
    activeRun?.status === "backoff";

  const onClick = async () => {
    if (tabId == null) return;
    setBusy(true);
    setError(undefined);
    try {
      await onStart(tabId, url, minimal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Analyze</h2>
      <div className="muted" style={{ marginBottom: 8 }}>
        {url ? shortUrl(url) : "No tab"}
      </div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button
          className="primary"
          disabled={!tabId || busy || running}
          onClick={onClick}
        >
          {running ? "Analyzing…" : "Analyze this page"}
        </button>
        {running && activeRun && (
          <button onClick={() => onCancel(activeRun.id)}>Cancel</button>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={minimal}
          onChange={(e) => setMinimal(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span className="muted">
          Force minimal mode (1–2 LLM calls)
        </span>
      </label>
      {activeRun && (
        <div style={{ marginTop: 8 }}>
          <div className="row">
            <span className="badge info">{activeRun.status}</span>
            <span className="badge">{activeRun.mode}</span>
            <span className="badge">
              LLM calls: {activeRun.callsMade}
            </span>
          </div>
          {activeRun.finalAnswer && (
            <div style={{ marginTop: 8 }}>
              <div className="muted">Final answer</div>
              <pre>{activeRun.finalAnswer}</pre>
            </div>
          )}
          {activeRun.errorMessage && (
            <div className="muted" style={{ color: "var(--err)", marginTop: 8 }}>
              {activeRun.errorMessage}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="toast err">{error}</div>
      )}
    </div>
  );
}

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.hostname + url.pathname;
  } catch {
    return u;
  }
}
