/**
 * Agent timeline: ordered list of tool/LLM/state events for the current run.
 */
import React from "react";
import type { ToolEvent } from "@/shared/messaging";
import { TimelineStepCard } from "./TimelineStepCard";

interface Props {
  events: ToolEvent[];
}

export function Timeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="card">
        <h2>Agent Timeline</h2>
        <div className="muted">No run yet. Click “Analyze this page”.</div>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Agent Timeline</h2>
      <div className="timeline">
        {events.map((e, i) => (
          <TimelineStepCard key={`${e.id ?? i}-${e.stepNumber}`} event={e} />
        ))}
      </div>
    </div>
  );
}
