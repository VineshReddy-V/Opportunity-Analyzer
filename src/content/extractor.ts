/**
 * Generic extractor + orchestration for site adapters.
 *
 * Pipeline (section 20 of the spec):
 *   1. JSON-LD JobPosting
 *   2. Semantic DOM sections
 *   3. Main content text
 *   4. Site adapter, if any matches
 *   5. Manual fallback (the caller sets `manualFallback=true` and uses the
 *      manualSelection module)
 *
 * Computes a confidence score in [0..1] and emits warnings when the data
 * looks thin or inconsistent.
 */

import type { OpportunityFact } from "@/shared/types";
import {
  cleanWhitespace,
  guessMainContentRoot,
  parseJsonLd,
  splitBullets,
  visibleText,
} from "./domUtils";
import { findAdapter } from "./adapters";
import { hashParts } from "@/shared/hashing";

/** Normalize + score an extraction candidate. */
export function extractOpportunity(): OpportunityFact {
  const hostname = location.hostname;
  const url = location.href;

  // Step 1: JSON-LD JobPosting
  const { objects } = parseJsonLd();
  const jobPosting = objects.find((o) => {
    const t = o?.["@type"];
    return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
  });

  // Step 4: site adapter
  const adapter = findAdapter(hostname, url);
  let base: Partial<OpportunityFact> | null = null;
  try {
    base = adapter?.extract() ?? null;
  } catch (e) {
    // Swallow adapter errors; we can still use the generic path.
    base = null;
  }

  // Step 2/3: semantic + main content fallback
  const generic = extractGeneric();

  const merged: OpportunityFact = mergeLayers(url, jobPosting, base, generic);
  merged.confidence = computeConfidence(merged);
  merged.warnings = collectWarnings(merged);
  merged.contentHash = hashParts(
    merged.title,
    merged.company,
    merged.requirements.join("|"),
  );
  return merged;
}

// --- layer 2/3: generic extraction -----------------------------------------

function extractGeneric(): Partial<OpportunityFact> {
  const root = guessMainContentRoot();
  const headings = Array.from(
    root.querySelectorAll?.("h1, h2, h3, h4") ?? [],
  ) as HTMLElement[];

  const title =
    cleanWhitespace(
      root.querySelector?.("h1")?.textContent ?? document.title,
    ) || undefined;

  const company =
    cleanWhitespace(
      document.querySelector("meta[property='og:site_name']")?.getAttribute(
        "content",
      ) ?? "",
    ) || undefined;

  const location =
    cleanWhitespace(
      document
        .querySelector("[class*=location], [data-testid*=location]")
        ?.textContent ?? "",
    ) || undefined;

  // Section finder: locate heading-delimited blocks.
  const bySection = (pattern: RegExp, cap: number): string[] => {
    const idx = headings.findIndex((h) =>
      pattern.test((h.textContent ?? "").toLowerCase()),
    );
    if (idx < 0) return [];
    const start = headings[idx];
    const end = headings[idx + 1];
    const out: string[] = [];
    let el: Element | null = start.nextElementSibling;
    while (el && el !== end) {
      el.querySelectorAll("li, p").forEach((li) => {
        const t = cleanWhitespace(li.textContent ?? "");
        if (t.length > 4 && t.length < 280) out.push(t);
      });
      el = el.nextElementSibling;
    }
    return out.slice(0, cap);
  };

  const responsibilities = bySection(
    /responsibilit|what you.?ll do|the role/,
    12,
  );
  const requirements = bySection(
    /requirement|qualification|who you are|what we.?re looking for|must have/,
    15,
  );
  const preferred = bySection(/preferred|nice to have|bonus|pluses?/, 10);
  const benefits = bySection(/benefit|perk|compensation|salary/, 8);

  const description =
    cleanWhitespace(visibleText(root).slice(0, 3000)) || undefined;

  // Fallback: if no requirements found, synthesize from bullet-like content.
  let reqFallback: string[] = [];
  if (requirements.length === 0 && description) {
    reqFallback = splitBullets(description).slice(0, 12);
  }

  return {
    title,
    company,
    location,
    description,
    responsibilities,
    requirements: requirements.length ? requirements : reqFallback,
    preferredSkills: preferred,
    benefits,
    applyUrl: (document.querySelector(
      "a[href*='apply' i], button[aria-label*='apply' i]",
    ) as HTMLAnchorElement | null)?.href,
    url: window.location.href,
    source: "generic",
  };
}

// --- Merging layers ---------------------------------------------------------

function pick<T>(...cands: (T | undefined | null | "")[]): T | undefined {
  for (const c of cands) if (c != null && c !== "") return c as T;
  return undefined;
}

function dedup(lists: (string[] | undefined)[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lst of lists) {
    if (!lst) continue;
    for (const s of lst) {
      const k = s.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(s.trim());
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function mergeLayers(
  url: string,
  ld: any | undefined,
  adapter: Partial<OpportunityFact> | null,
  generic: Partial<OpportunityFact>,
): OpportunityFact {
  const ldTitle = ld?.title ?? ld?.name;
  const ldCompany =
    ld?.hiringOrganization?.name ?? ld?.hiringOrganization;
  const ldLocation =
    (typeof ld?.jobLocation?.address?.addressLocality === "string"
      ? ld.jobLocation.address.addressLocality
      : undefined) ??
    (typeof ld?.jobLocation === "string" ? ld.jobLocation : undefined);
  const ldDesc = typeof ld?.description === "string" ? ld.description : undefined;
  const ldEmployment = ld?.employmentType;
  const ldSalary = ld?.baseSalary?.value?.value
    ? `${ld.baseSalary.value.value} ${ld.baseSalary.currency ?? ""}`
    : undefined;
  const ldPostedDate = ld?.datePosted;

  return {
    title: pick(adapter?.title, ldTitle, generic.title),
    company: pick(adapter?.company, ldCompany, generic.company),
    location: pick(adapter?.location, ldLocation, generic.location),
    description: pick(adapter?.description, ldDesc, generic.description),
    employmentType: pick(adapter?.employmentType, ldEmployment),
    salaryText: pick(adapter?.salaryText, ldSalary),
    postedDate: pick(adapter?.postedDate, ldPostedDate),
    responsibilities: dedup(
      [adapter?.responsibilities, generic.responsibilities],
      12,
    ),
    requirements: dedup(
      [adapter?.requirements, generic.requirements],
      15,
    ),
    preferredSkills: dedup(
      [adapter?.preferredSkills, generic.preferredSkills],
      10,
    ),
    benefits: dedup([adapter?.benefits, generic.benefits], 8),
    applyUrl: pick(adapter?.applyUrl, generic.applyUrl),
    url,
    source: adapter?.source ?? generic.source ?? "generic",
    confidence: 0.5,
    warnings: [],
    contentHash: "",
  };
}

// --- Confidence / warnings --------------------------------------------------

function computeConfidence(op: OpportunityFact): number {
  let score = 0;
  if (op.title) score += 0.15;
  if (op.company) score += 0.15;
  if (op.location) score += 0.05;
  if (op.description && op.description.length > 200) score += 0.1;
  if (op.requirements.length >= 3) score += 0.2;
  if (op.requirements.length >= 8) score += 0.1;
  if (op.responsibilities.length >= 2) score += 0.1;
  if (op.source !== "generic") score += 0.1; // adapter applied
  if (op.applyUrl) score += 0.05;
  return Math.min(1, Math.max(0, Number(score.toFixed(2))));
}

function collectWarnings(op: OpportunityFact): string[] {
  const out: string[] = [];
  if (!op.title) out.push("Missing title; may be inferred");
  if (!op.company) out.push("Missing company; may be inferred");
  if (op.requirements.length < 3)
    out.push("Requirements list looks short; consider manual selection");
  if (!op.description || op.description.length < 200)
    out.push("Description is very short; extraction may be incomplete");
  return out;
}

/**
 * Build an OpportunityFact from a user-selected text block (manual fallback).
 */
export function extractFromManualText(selectedText: string): OpportunityFact {
  const desc = cleanWhitespace(selectedText).slice(0, 6000);
  const bullets = splitBullets(desc);
  const op: OpportunityFact = {
    title: document.title || undefined,
    company: undefined,
    location: undefined,
    description: desc,
    responsibilities: bullets.slice(0, 8),
    requirements: bullets.slice(0, 12),
    preferredSkills: [],
    benefits: [],
    applyUrl: undefined,
    url: window.location.href,
    source: "manual",
    confidence: 0.45,
    warnings: [
      "Extracted from user-selected text; title/company may be missing",
    ],
    contentHash: hashParts(document.title, desc.slice(0, 200)),
  };
  return op;
}
