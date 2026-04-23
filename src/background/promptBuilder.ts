/**
 * Prompt Builder / Compressor
 *
 * Builds compact prompts for the three possible Gemini calls:
 *   1) Plan/Analyze (normal mode)
 *   2) Analyze-combined (minimal mode)
 *   3) Generate assets
 *
 * Core rule: never include raw DOM or full resume. Instead include only
 * the canonicalized, compact objects. All outputs are strict JSON via
 * `responseMimeType: application/json`.
 */

import type {
  CandidateProfileSummary,
  DeterministicFit,
  OpportunityFact,
  ToolEvent,
} from "@/shared/types";

/** Shared system preamble. Keep terse and strictly JSON-only. */
const SHARED_SYSTEM = `You are an assistant embedded in a browser extension.
Respond with COMPACT, STRICT JSON ONLY that matches the schema in the user message.
Never include markdown fences. Never add commentary. Never invent fields.
Keep all strings short. Limit arrays to the sizes given. Use plain English.`;

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function compactProfile(profile: CandidateProfileSummary) {
  return {
    targetRoles: profile.targetRoles.slice(0, 6),
    experienceYears: profile.experienceYears,
    topSkills: profile.topSkills.slice(0, 15),
    projectHighlights: profile.projectHighlights
      .slice(0, 4)
      .map((p) => truncate(p, 200)),
    preferredLocations: profile.preferredLocations.slice(0, 5),
    summary: truncate(profile.summary, profile.redactedMode ? 400 : 800),
    redactedMode: profile.redactedMode,
  };
}

function compactOpportunity(op: OpportunityFact) {
  return {
    title: op.title,
    company: op.company,
    location: op.location,
    employmentType: op.employmentType,
    salaryText: op.salaryText ? truncate(op.salaryText, 120) : undefined,
    description: truncate(op.description, 1000),
    responsibilities: op.responsibilities.slice(0, 10).map((r) => truncate(r, 160)),
    requirements: op.requirements.slice(0, 15).map((r) => truncate(r, 160)),
    preferredSkills: op.preferredSkills.slice(0, 10),
    benefits: op.benefits.slice(0, 6),
    source: op.source,
    confidence: Number(op.confidence.toFixed(2)),
    warnings: op.warnings.slice(0, 5),
  };
}

function compactFit(fit: DeterministicFit) {
  return {
    score: Math.round(fit.score),
    requiredSkillMatches: fit.requiredSkillMatches.slice(0, 15),
    requiredSkillGaps: fit.requiredSkillGaps.slice(0, 10),
    preferredSkillMatches: fit.preferredSkillMatches.slice(0, 10),
    preferredSkillGaps: fit.preferredSkillGaps.slice(0, 8),
    titleSimilarity: Number(fit.titleSimilarity.toFixed(2)),
    experienceSignal: fit.experienceSignal,
    notes: fit.notes.slice(0, 4).map((n) => truncate(n, 120)),
  };
}

/**
 * Extremely compact prior-history view for each call. We keep only the
 * most useful pieces; no repeated long text.
 */
function compactHistory(events: ToolEvent[]) {
  return events
    .filter((e) => e.kind !== "info")
    .slice(-10)
    .map((e) => ({
      step: e.stepNumber,
      kind: e.kind,
      name: e.name,
      status: e.status,
      summary: truncate(e.reasoningSummary ?? e.resultPreview, 160),
    }));
}

// --- Call 1 (normal): Plan + Analyze on compact evidence -------------------

export interface PlanAnalyzeInput {
  userRequest: string;
  opportunity: OpportunityFact;
  profile: CandidateProfileSummary;
  fit: DeterministicFit;
  history: ToolEvent[];
  forceMinimal?: boolean;
}

export function buildPlanAnalyzePrompt(input: PlanAnalyzeInput): string {
  const payload = {
    schema: {
      fitExplanation: "string <= 500 chars",
      strengths: "string[] max 5",
      gaps: "string[] max 5",
      recommendation: "'apply' | 'tailor_then_apply' | 'skip'",
      needsGeneration: "boolean",
      reasoningSummary: "string <= 200 chars",
    },
    userRequest: truncate(input.userRequest, 200),
    evidence: {
      opportunity: compactOpportunity(input.opportunity),
      profile: compactProfile(input.profile),
      deterministicFit: compactFit(input.fit),
    },
    recentAgentHistory: compactHistory(input.history),
    mode: input.forceMinimal ? "minimal" : "normal",
    instructions: [
      "Ground every claim in the evidence above.",
      "If deterministicFit.score >= 65 and no major gaps, set recommendation='apply'.",
      "If score 40-64 set recommendation='tailor_then_apply'.",
      "If score < 40 or critical missing requirement, set recommendation='skip'.",
      "Set needsGeneration=true only when recommendation != 'skip' AND profile has enough context.",
    ],
  };
  return `${SHARED_SYSTEM}\nRespond as JSON matching schema.\nINPUT:\n${JSON.stringify(payload)}`;
}

// --- Call 2: Generate application assets -----------------------------------

export interface GenerateAssetsInput {
  opportunity: OpportunityFact;
  profile: CandidateProfileSummary;
  fit: DeterministicFit;
  recommendation: string;
  strengths: string[];
  gaps: string[];
  mode: "normal" | "minimal";
}

export function buildGenerateAssetsPrompt(input: GenerateAssetsInput): string {
  const payload = {
    schema: {
      recruiterNote: "string <= 600 chars, professional, specific",
      applicationSummary: "string <= 400 chars",
      tailoredBullets: "string[] up to 3, each <= 160 chars",
      producedIn: "'normal' | 'minimal'",
    },
    opportunity: compactOpportunity(input.opportunity),
    profile: compactProfile(input.profile),
    deterministicFit: compactFit(input.fit),
    recommendation: input.recommendation,
    strengths: input.strengths.slice(0, 4),
    gaps: input.gaps.slice(0, 4),
    mode: input.mode,
    instructions: [
      "Use ONLY facts from profile/opportunity. Do not invent companies or numbers.",
      "Recruiter note: second person, opens with a concrete matching skill, no fluff.",
      "Application summary: one short paragraph the candidate could paste into an apply form.",
      "Three bullets: impact-oriented, each references a concrete skill overlap or project.",
      `producedIn must be "${input.mode}".`,
    ],
  };
  return `${SHARED_SYSTEM}\nRespond as JSON matching schema.\nINPUT:\n${JSON.stringify(payload)}`;
}

// --- Utility for token estimation ------------------------------------------

/** Rough character length of a prompt; caller uses estimateTokens on it. */
export function promptSizeChars(prompt: string): number {
  return prompt.length;
}
