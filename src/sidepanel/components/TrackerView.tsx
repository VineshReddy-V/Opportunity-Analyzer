/**
 * TrackerView — list of saved opportunities with status controls.
 */
import React, { useEffect, useState } from "react";
import { MSG } from "@/shared/messaging";
import { sendMessage } from "../hooks/useBackgroundBridge";
import type { TrackerRecord } from "@/shared/messaging";

const STATUS_ORDER: TrackerRecord["status"][] = [
  "saved",
  "review_needed",
  "ready_to_apply",
  "applied",
  "archived",
];

export function TrackerView() {
  const [records, setRecords] = useState<TrackerRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>(undefined);

  const refresh = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      const r = await sendMessage<
        { type: string },
        { ok: boolean; records: TrackerRecord[]; error?: string }
      >({ type: MSG.listTracker });
      if (r.ok) setRecords(r.records);
      else setErr(r.error ?? "failed to load");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const setStatus = async (id: string, status: TrackerRecord["status"]) => {
    await sendMessage({ type: MSG.updateTrackerStatus, id, status });
    await refresh();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this tracker record?")) return;
    await sendMessage({ type: MSG.deleteTrackerRecord, id });
    await refresh();
  };

  return (
    <div>
      <div className="card">
        <h2>Tracker</h2>
        <div className="row">
          <button onClick={refresh} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
          <span className="muted">{records.length} records</span>
        </div>
        {err && <div className="muted" style={{ color: "var(--err)" }}>{err}</div>}
      </div>
      {records.length === 0 && (
        <div className="card muted">No saved opportunities yet.</div>
      )}
      {records.map((r) => (
        <div key={r.id} className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: 0 }}>{r.title ?? "(untitled)"}</h3>
              <div className="muted">
                {[r.company, r.location].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className={`badge ${statusBadge(r.status)}`}>
              {r.status}
            </span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="badge info">
              confidence: {Math.round(r.confidence * 100)}%
            </span>
            {r.fit && (
              <span className="badge">score: {r.fit.score}/100</span>
            )}
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer">
                open page
              </a>
            )}
          </div>
          <div className="row" style={{ marginTop: 6, gap: 4 }}>
            <select
              value={r.status}
              onChange={(e) =>
                setStatus(r.id, e.target.value as TrackerRecord["status"])
              }
              style={{ width: "auto", flex: "0 0 auto" }}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="danger ghost" onClick={() => del(r.id)}>
              delete
            </button>
          </div>
          {r.assets && (
            <details style={{ marginTop: 6 }}>
              <summary>Generated assets</summary>
              <div className="muted">Recruiter note</div>
              <pre>{r.assets.recruiterNote}</pre>
              <div className="muted">Summary</div>
              <pre>{r.assets.applicationSummary}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function statusBadge(s: TrackerRecord["status"]): string {
  switch (s) {
    case "ready_to_apply":
    case "applied":
      return "ok";
    case "review_needed":
      return "warn";
    case "archived":
      return "";
    default:
      return "info";
  }
}
