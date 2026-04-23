/**
 * GeneratedAssets — recruiter note, application summary, tailored bullets.
 */
import React, { useState } from "react";
import type { GeneratedAssets as G } from "@/shared/messaging";

interface Props {
  assets?: G;
}

export function GeneratedAssets({ assets }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  if (!assets) return null;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="card">
      <h2>Generated Assets ({assets.producedIn} mode)</h2>
      <div className="muted">Recruiter note</div>
      <pre>{assets.recruiterNote}</pre>
      <button onClick={() => copy("note", assets.recruiterNote)}>
        {copiedKey === "note" ? "copied" : "copy"}
      </button>
      <div className="muted" style={{ marginTop: 8 }}>
        Application summary
      </div>
      <pre>{assets.applicationSummary}</pre>
      <button onClick={() => copy("app", assets.applicationSummary)}>
        {copiedKey === "app" ? "copied" : "copy"}
      </button>
      {assets.tailoredBullets.length > 0 && (
        <>
          <div className="muted" style={{ marginTop: 8 }}>
            Tailored bullets
          </div>
          <ul className="bullets">
            {assets.tailoredBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <button
            onClick={() =>
              copy("bullets", assets.tailoredBullets.map((b) => "• " + b).join("\n"))
            }
          >
            {copiedKey === "bullets" ? "copied" : "copy bullets"}
          </button>
        </>
      )}
    </div>
  );
}
