/**
 * OpportunityPreview — shows the extracted opportunity fact.
 */
import React from "react";
import type { OpportunityFact } from "@/shared/messaging";

interface Props {
  opportunity?: OpportunityFact;
}

export function OpportunityPreview({ opportunity }: Props) {
  if (!opportunity) return null;
  const confPct = Math.round(opportunity.confidence * 100);
  const confBadge = confPct >= 70 ? "ok" : confPct >= 50 ? "warn" : "err";
  return (
    <div className="card">
      <h2>Opportunity</h2>
      <h3>{opportunity.title ?? "(untitled)"}</h3>
      <div className="muted" style={{ marginBottom: 6 }}>
        {[opportunity.company, opportunity.location]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="badge info">source: {opportunity.source}</span>
        <span className={`badge ${confBadge}`}>
          confidence: {confPct}%
        </span>
        {opportunity.employmentType && (
          <span className="badge">{opportunity.employmentType}</span>
        )}
      </div>
      {opportunity.warnings.length > 0 && (
        <div className="muted" style={{ marginBottom: 6 }}>
          ⚠ {opportunity.warnings.join(" · ")}
        </div>
      )}
      <details>
        <summary>Requirements ({opportunity.requirements.length})</summary>
        <ul className="bullets">
          {opportunity.requirements.slice(0, 15).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>
      {opportunity.responsibilities.length > 0 && (
        <details>
          <summary>
            Responsibilities ({opportunity.responsibilities.length})
          </summary>
          <ul className="bullets">
            {opportunity.responsibilities.slice(0, 12).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}
      {opportunity.preferredSkills.length > 0 && (
        <details>
          <summary>Preferred ({opportunity.preferredSkills.length})</summary>
          <ul className="bullets">
            {opportunity.preferredSkills.slice(0, 10).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}
      {opportunity.applyUrl && (
        <div className="muted" style={{ marginTop: 6 }}>
          <a href={opportunity.applyUrl} target="_blank" rel="noreferrer">
            Apply link
          </a>
        </div>
      )}
    </div>
  );
}
