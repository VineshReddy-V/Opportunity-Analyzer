/**
 * QueueStatus — lightweight display of the run queue (active + queued).
 */
import React, { useEffect, useState } from "react";
import { MSG } from "@/shared/messaging";
import { sendMessage } from "../hooks/useBackgroundBridge";

interface QueueItem {
  runId: string;
  url: string;
  status: string;
}

export function QueueStatus() {
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await sendMessage<
          { type: string },
          { ok: boolean; queued: QueueItem[] }
        >({ type: MSG.getQueue });
        if (!cancelled && r.ok) setItems(r.queued ?? []);
      } catch {
        /* ignore */
      }
    };
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="card">
      <h2>Run Queue</h2>
      {items.map((q, i) => (
        <div key={q.runId} className="row" style={{ marginBottom: 4 }}>
          <span className="badge">{i === 0 ? "active" : "queued"}</span>
          <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {shortUrl(q.url)}
          </span>
        </div>
      ))}
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
