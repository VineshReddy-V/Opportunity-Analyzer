/**
 * FitSummary — deterministic fit score + LLM explanation.
 */
import React from "react";
import type { RunRecord } from "@/shared/messaging";

interface Props {
  run?: RunRecord;
}

export function FitSummary({ run }: Props) {
  if (!run?.fit) return null;
  const fit = run.fit;
  const scoreBadge =
    fit.score >= 65 ? "ok" : fit.score >= 40 ? "warn" : "err";
  return (
    <div className="card">
      <h2>Fit Summary</h2>
      <div className="row">
        <span className={`badge ${scoreBadge}`}>
          deterministic score: {fit.score}/100
        </span>
        <span className="badge">
          title sim: {(fit.titleSimilarity * 100).toFixed(0)}%
        </span>
        <span className="badge">exp: {fit.experienceSignal}</span>
      </div>
      {run.llmAnalysis && (
        <>
          <div style={{ marginTop: 8 }}>
            <strong>LLM explanation:</strong>{" "}
            <span>{run.llmAnalysis.fitExplanation}</span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="badge info">
              recommendation: {run.llmAnalysis.recommendation}
            </span>
          </div>
          {run.llmAnalysis.strengths.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 6 }}>Strengths</div>
              <ul className="bullets">
                {run.llmAnalysis.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {run.llmAnalysis.gaps.length > 0 && (
            <>
              <div className="muted" style={{ marginTop: 6 }}>Gaps</div>
              <ul className="bullets">
                {run.llmAnalysis.gaps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {fit.requiredSkillMatches.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary>
            Required skill matches ({fit.requiredSkillMatches.length})
          </summary>
          <ul className="bullets">
            {fit.requiredSkillMatches.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      {fit.requiredSkillGaps.length > 0 && (
        <details>
          <summary>
            Required skill gaps ({fit.requiredSkillGaps.length})
          </summary>
          <ul className="bullets">
            {fit.requiredSkillGaps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
