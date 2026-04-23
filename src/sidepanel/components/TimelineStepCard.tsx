/**
 * Single step card in the agent timeline.
 */
import React from "react";
import type { ToolEvent } from "@/shared/messaging";

interface Props {
  event: ToolEvent;
}

export function TimelineStepCard({ event }: Props) {
  const statusBadge =
    event.status === "ok"
      ? "ok"
      : event.status === "error"
        ? "err"
        : event.status === "start"
          ? "info"
          : "";
  const klass =
    event.kind === "llm" ? "llm" : event.status === "error" ? "error" : "ok";
  return (
    <div className={`step ${klass}`}>
      <div className="step-head">
        <div>
          <strong>#{event.stepNumber}</strong>{" "}
          <span className={`badge ${statusBadge}`}>{event.status}</span>{" "}
          <span className="badge info">{event.kind}</span>{" "}
          <span>{event.name}</span>
        </div>
        <div>
          {event.durationMs != null ? `${event.durationMs}ms` : ""}
        </div>
      </div>
      {event.reasoningSummary && (
        <div style={{ marginTop: 4 }}>{event.reasoningSummary}</div>
      )}
      {event.argsPreview && (
        <details>
          <summary>args</summary>
          <pre>{JSON.stringify(event.argsPreview, null, 2)}</pre>
        </details>
      )}
      {event.resultPreview && (
        <details>
          <summary>result</summary>
          <pre>{event.resultPreview}</pre>
        </details>
      )}
    </div>
  );
}
