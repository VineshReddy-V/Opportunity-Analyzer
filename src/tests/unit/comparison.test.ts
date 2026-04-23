/**
 * Unit tests for deterministic profile<->opportunity comparison.
 */

import { describe, expect, it } from "vitest";
import { compareProfileToOpportunity } from "@/background/toolRegistry";
import type { CandidateProfileSummary, OpportunityFact } from "@/shared/types";

function makeProfile(
  overrides: Partial<CandidateProfileSummary> = {},
): CandidateProfileSummary {
  return {
    targetRoles: ["Software Engineer", "Backend Engineer"],
    experienceYears: 5,
    topSkills: ["TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker"],
    projectHighlights: [],
    preferredLocations: [],
    summary: "",
    redactedMode: true,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeOpportunity(
  overrides: Partial<OpportunityFact> = {},
): OpportunityFact {
  return {
    title: "Senior Software Engineer, Backend",
    company: "Acme",
    url: "https://example.com/jobs/1",
    description: "",
    responsibilities: [],
    requirements: ["TypeScript", "Node.js", "PostgreSQL"],
    preferredSkills: ["AWS", "Kafka"],
    benefits: [],
    source: "test",
    confidence: 0.9,
    warnings: [],
    contentHash: "",
    ...overrides,
  };
}

describe("compareProfileToOpportunity", () => {
  it("scores a perfect required-skill overlap high", () => {
    const fit = compareProfileToOpportunity(makeProfile(), makeOpportunity());
    expect(fit.requiredSkillMatches.length).toBe(3);
    expect(fit.requiredSkillGaps.length).toBe(0);
    expect(fit.score).toBeGreaterThanOrEqual(70);
  });

  it("flags missing required skills as gaps", () => {
    const fit = compareProfileToOpportunity(
      makeProfile({ topSkills: ["Ruby"] }),
      makeOpportunity(),
    );
    expect(fit.requiredSkillMatches.length).toBe(0);
    expect(fit.requiredSkillGaps.length).toBe(3);
    expect(fit.score).toBeLessThan(30);
  });

  it("picks up years-of-experience hints from requirements", () => {
    const fit = compareProfileToOpportunity(
      makeProfile({ experienceYears: 2 }),
      makeOpportunity({
        requirements: ["5+ years of experience", "TypeScript"],
      }),
    );
    expect(fit.experienceSignal).toBe("below");
  });

  it("rewards title similarity", () => {
    const low = compareProfileToOpportunity(
      makeProfile({ targetRoles: ["UX Designer"] }),
      makeOpportunity(),
    );
    const high = compareProfileToOpportunity(
      makeProfile({ targetRoles: ["Senior Backend Software Engineer"] }),
      makeOpportunity(),
    );
    expect(high.titleSimilarity).toBeGreaterThan(low.titleSimilarity);
  });

  it("produces notes when profile is empty", () => {
    const fit = compareProfileToOpportunity(
      makeProfile({ topSkills: [] }),
      makeOpportunity(),
    );
    expect(fit.notes.join(" ").toLowerCase()).toContain("no skills");
  });
});
