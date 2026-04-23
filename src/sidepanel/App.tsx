/**
 * Top-level side panel App. Routes between Analyze, Tracker, Settings tabs.
 */
import React, { useEffect, useState } from "react";
import { AnalyzePanel } from "./components/AnalyzePanel";
import { BudgetStatus } from "./components/BudgetStatus";
import { FitSummary } from "./components/FitSummary";
import { GeneratedAssets } from "./components/GeneratedAssets";
import { OpportunityPreview } from "./components/OpportunityPreview";
import { QueueStatus } from "./components/QueueStatus";
import { SettingsView } from "./components/SettingsView";
import { Timeline } from "./components/Timeline";
import { TrackerView } from "./components/TrackerView";
import { useBackgroundBridge } from "./hooks/useBackgroundBridge";
import { APP_NAME } from "@/shared/constants";

type Tab = "analyze" | "tracker" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("analyze");
  const bridge = useBackgroundBridge();

  useEffect(() => {
    void bridge.refreshActive();
  }, [bridge]);

  return (
    <div className="app">
      <header>
        <h1>{APP_NAME}</h1>
        <span className="muted">v0.1</span>
      </header>
      <nav>
        <button
          className={tab === "analyze" ? "active" : "ghost"}
          onClick={() => setTab("analyze")}
        >
          Analyze
        </button>
        <button
          className={tab === "tracker" ? "active" : "ghost"}
          onClick={() => setTab("tracker")}
        >
          Tracker
        </button>
        <button
          className={tab === "settings" ? "active" : "ghost"}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </nav>
      <main>
        {tab === "analyze" && (
          <>
            <BudgetStatus snapshot={bridge.budget} />
            <QueueStatus />
            <AnalyzePanel
              activeRun={bridge.activeRun}
              onStart={async (tabId, url, forceMinimal) => {
                await bridge.startRun(tabId, url, forceMinimal);
              }}
              onCancel={async (runId) => {
                await bridge.cancelRun(runId);
              }}
            />
            <Timeline events={bridge.toolEvents} />
            <OpportunityPreview opportunity={bridge.activeRun?.opportunity} />
            <FitSummary run={bridge.activeRun} />
            <GeneratedAssets assets={bridge.activeRun?.assets} />
          </>
        )}
        {tab === "tracker" && <TrackerView />}
        {tab === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
