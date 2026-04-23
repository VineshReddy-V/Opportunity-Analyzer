/**
 * Deterministic page classifier.
 *
 * Cheap signals only — no LLM. This runs inside the content script and
 * decides which of the 5 page types the current tab is. The orchestrator
 * uses this to skip irrelevant pages entirely before any Gemini call.
 */

import type { PageSignals, PageType } from "@/shared/types";
import {
  cleanWhitespace,
  collectHeadings,
  parseJsonLd,
  visibleText,
} from "./domUtils";

const OPPORTUNITY_KEYWORDS_STRONG = [
  "responsibilities",
  "requirements",
  "qualifications",
  "apply now",
  "apply for this",
  "job description",
  "what you'll do",
  "what you will do",
  "who you are",
  "about the role",
  "about this role",
  "benefits",
  "compensation",
  "remote",
  "hybrid",
  "full-time",
  "part-time",
  "internship",
];

const LISTING_KEYWORDS = [
  "open roles",
  "open positions",
  "all jobs",
  "careers",
  "current openings",
  "view jobs",
];

const COMPANY_PAGE_KEYWORDS = [
  "about us",
  "our mission",
  "our team",
  "our values",
  "company overview",
];

const JOB_LD_TYPES = new Set(["JobPosting", "JobPostings"]);

export function classifyPage(): { pageType: PageType; signals: PageSignals } {
  const url = location.href;
  const hostname = location.hostname;
  const title = document.title ?? "";
  const headings = collectHeadings(document);
  const ld = parseJsonLd();

  const visible = visibleText(document).slice(0, 6000).toLowerCase();
  const titleLower = title.toLowerCase();

  const compactDigest =
    [title, ...headings.slice(0, 5)].join(" | ").slice(0, 400);

  const signals: PageSignals = {
    url,
    hostname,
    title,
    topHeadings: headings.slice(0, 12),
    textSample: cleanWhitespace(visibleText(document).slice(0, 2500)),
    hasJsonLd: ld.objects.length > 0,
    jsonLdTypes: ld.types,
    compactDigest,
  };

  // Strong positive: structured JobPosting metadata.
  if (ld.types.some((t) => JOB_LD_TYPES.has(t))) {
    return { pageType: "opportunity_detail", signals };
  }

  // Listing pages often advertise multiple jobs in the URL or heading.
  const urlLower = url.toLowerCase();
  const looksLikeListing =
    /\/(careers|jobs|openings|positions|opportunities)\/?(\?|$)/.test(
      urlLower,
    ) ||
    LISTING_KEYWORDS.some((k) => visible.includes(k));
  const looksLikeOpportunityUrl =
    /\/(job|jobs|role|opportunity|posting|opening|apply)[/_-]/.test(urlLower) ||
    /\/job[/_-]?\d+/.test(urlLower) ||
    /greenhouse\.io|lever\.co|boards\.|workdayjobs\.com|linkedin\.com\/jobs\//.test(
      urlLower,
    );

  // Count strong opportunity cues.
  let strongHits = 0;
  for (const k of OPPORTUNITY_KEYWORDS_STRONG) {
    if (visible.includes(k)) strongHits += 1;
  }

  // Title heuristic: "Software Engineer @ Acme" or "Acme — Careers".
  const titleOpportunityish =
    /\b(engineer|developer|designer|scientist|intern|manager|analyst|consultant|lead|architect|specialist)\b/.test(
      titleLower,
    ) && !/article|blog|press release|news/.test(titleLower);

  if (looksLikeOpportunityUrl && strongHits >= 2) {
    return { pageType: "opportunity_detail", signals };
  }
  if (titleOpportunityish && strongHits >= 3) {
    return { pageType: "opportunity_detail", signals };
  }
  if (looksLikeListing || strongHits >= 4) {
    return { pageType: "opportunity_listing", signals };
  }

  // Company "about" page with no job content.
  if (
    COMPANY_PAGE_KEYWORDS.some((k) => visible.includes(k)) &&
    strongHits < 2
  ) {
    return { pageType: "company_page", signals };
  }

  // Final fallback.
  if (strongHits >= 2) {
    return { pageType: "opportunity_detail", signals };
  }

  // Decide between "unknown" (ambiguous) and "irrelevant" (clearly not jobs).
  const isLikelyArticle =
    /\/(blog|news|article|press|post|story)\//.test(urlLower) ||
    /<h1[^>]*>.{0,80}<\/h1>/i.test(document.body?.innerHTML ?? "") === false;
  if (isLikelyArticle && strongHits === 0) {
    return { pageType: "irrelevant", signals };
  }

  return { pageType: "unknown", signals };
}
