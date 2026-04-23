/**
 * BudgetStatus card — shows mode, model, budget health, queue, 429 state.
 */
import React from "react";
import type { BudgetSnapshot } from "@/shared/messaging";

interface Props {
  snapshot?: BudgetSnapshot;
}

function pct(n: number) {
  return `${Math.round(n)}%`;
}

export function BudgetStatus({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="card">
        <h2>Gemini Budget</h2>
        <div className="muted">Loading…</div>
      </div>
    );
  }
  const healthBadge =
    snapshot.health === "healthy"
      ? "ok"
      : snapshot.health === "constrained"
        ? "warn"
        : "err";
  const modeBadge =
    snapshot.mode === "normal" ? "ok" : "warn";

  const backoffLabel = snapshot.backoffUntil
    ? `${Math.max(0, Math.round((snapshot.backoffUntil - Date.now()) / 1000))}s`
    : null;

  return (
    <div className="card">
      <h2>Gemini Budget</h2>
      <div className="row" style={{ gap: 6 }}>
        <span className={`badge ${modeBadge}`}>mode: {snapshot.mode}</span>
        <span className={`badge ${healthBadge}`}>
          health: {snapshot.health}
        </span>
        {snapshot.recent429 && <span className="badge err">429 recent</span>}
        {backoffLabel && (
          <span className="badge warn">backoff: {backoffLabel}</span>
        )}
        <span className="badge info">queued: {snapshot.queuedRuns}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="muted">RPM — {pct(snapshot.rpmUsedPct)}</div>
        <div className="progress">
          <span style={{ width: `${snapshot.rpmUsedPct}%` }} />
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="muted">TPM — {pct(snapshot.tpmUsedPct)}</div>
        <div className="progress">
          <span style={{ width: `${snapshot.tpmUsedPct}%` }} />
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="muted">RPD — {pct(snapshot.rpdUsedPct)}</div>
        <div className="progress">
          <span style={{ width: `${snapshot.rpdUsedPct}%` }} />
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        model: <span style={{ color: "var(--text)" }}>{snapshot.activeModel || "(unset)"}</span>
      </div>
    </div>
  );
}
