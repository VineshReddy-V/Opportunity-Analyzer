/**
 * Zod schemas for all structured I/O that crosses component boundaries
 * or comes back from Gemini. Keep these compact and strict — compactness
 * reduces prompt size and strictness prevents silent corruption.
 */

import { z } from "zod";

export const PageTypeSchema = z.enum([
  "opportunity_detail",
  "opportunity_listing",
  "company_page",
  "unknown",
  "irrelevant",
]);

export const PageSignalsSchema = z.object({
  url: z.string(),
  hostname: z.string(),
  title: z.string().default(""),
  topHeadings: z.array(z.string()).default([]),
  textSample: z.string().default(""),
  hasJsonLd: z.boolean().default(false),
  jsonLdTypes: z.array(z.string()).default([]),
  compactDigest: z.string().default(""),
});

export const OpportunityFactSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.string().optional(),
  salaryText: z.string().optional(),
  postedDate: z.string().optional(),
  url: z.string(),
  description: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  applyUrl: z.string().optional(),
  source: z.string().default("generic"),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string()).default([]),
  contentHash: z.string().default(""),
});

export const CandidateProfileSummarySchema = z.object({
  displayName: z.string().optional(),
  targetRoles: z.array(z.string()).default([]),
  experienceYears: z.number().min(0).default(0),
  topSkills: z.array(z.string()).default([]),
  projectHighlights: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  summary: z.string().default(""),
  redactedMode: z.boolean().default(true),
  updatedAt: z.number().default(() => Date.now()),
});

export const GeminiSettingsSchema = z.object({
  provider: z.enum(["gemini", "openai"]).default("gemini"),
  apiKey: z.string().default(""),
  primaryModel: z.string().default("gemini-2.5-flash-lite"),
  fallbackModel: z.string().default("gemini-2.5-flash"),
  openaiApiKey: z.string().default(""),
  openaiModel: z.string().default("gpt-4o-mini"),
  mockMode: z.boolean().default(false),
});

export const RateBudgetConfigSchema = z.object({
  rpm: z.number().min(1).default(10),
  tpm: z.number().min(1000).default(120_000),
  rpd: z.number().min(1).default(200),
  safetyReservePct: z.number().min(0).max(90).default(25),
  maxCallsPerRun: z.number().min(1).max(3).default(3),
  autoMinimalMode: z.boolean().default(true),
});

export const DeterministicFitSchema = z.object({
  score: z.number().min(0).max(100),
  requiredSkillMatches: z.array(z.string()),
  requiredSkillGaps: z.array(z.string()),
  preferredSkillMatches: z.array(z.string()),
  preferredSkillGaps: z.array(z.string()),
  titleSimilarity: z.number().min(0).max(1),
  experienceSignal: z.enum(["below", "match", "above", "unknown"]),
  notes: z.array(z.string()),
});

/** Strict JSON output shape expected from Gemini Plan/Analyze call. */
export const LlmAnalysisSchema = z.object({
  fitExplanation: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.enum(["apply", "tailor_then_apply", "skip"]),
  needsGeneration: z.boolean(),
  reasoningSummary: z.string(),
});

/** Strict JSON output shape expected from Gemini Plan call (normal mode). */
export const LlmPlanSchema = z.object({
  reasoningSummary: z.string(),
  nextToolCalls: z.array(z.string()),
  skipGeneration: z.boolean().default(false),
});

/** Strict JSON output shape expected from Gemini Generation call. */
export const GeneratedAssetsSchema = z.object({
  recruiterNote: z.string(),
  applicationSummary: z.string(),
  tailoredBullets: z.array(z.string()).max(5),
  producedIn: z.enum(["normal", "minimal"]).default("normal"),
});

export type GeminiSettingsInput = z.input<typeof GeminiSettingsSchema>;
export type RateBudgetConfigInput = z.input<typeof RateBudgetConfigSchema>;
export type CandidateProfileInput = z.input<typeof CandidateProfileSummarySchema>;
