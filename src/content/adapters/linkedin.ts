/**
 * LinkedIn Jobs adapter.
 * LinkedIn's DOM changes frequently; we keep selectors loose and
 * fallback-friendly.
 */
import type { SiteAdapter } from "./types";
import { collectTexts, textOrEmpty } from "./types";
import { splitBullets } from "../domUtils";

export const linkedInAdapter: SiteAdapter = {
  id: "linkedin",
  matches(hostname, url) {
    return (
      hostname.includes("linkedin.com") &&
      /\/jobs\/(view|collections|search)/.test(url)
    );
  },
  extract() {
    const title =
      textOrEmpty(document.querySelector("h1")) ||
      textOrEmpty(
        document.querySelector(".job-details-jobs-unified-top-card__job-title"),
      ) ||
      textOrEmpty(document.querySelector(".top-card-layout__title"));

    const company =
      textOrEmpty(
        document.querySelector(
          ".job-details-jobs-unified-top-card__company-name",
        ),
      ) ||
      textOrEmpty(document.querySelector(".topcard__org-name-link")) ||
      textOrEmpty(document.querySelector("a[data-tracking-control-name*=org]"));

    const location =
      textOrEmpty(
        document.querySelector(
          ".job-details-jobs-unified-top-card__bullet",
        ),
      ) ||
      textOrEmpty(document.querySelector(".topcard__flavor--bullet"));

    const descEl =
      document.querySelector(".jobs-description-content__text") ??
      document.querySelector(".show-more-less-html__markup") ??
      document.querySelector(".jobs-description__container");
    const description = textOrEmpty(descEl);
    const bullets = splitBullets(description);

    // Heuristic: after "Requirements"/"Qualifications" header, collect bullets.
    const requirements: string[] = [];
    const preferred: string[] = [];
    if (descEl) {
      const html = (descEl as HTMLElement).innerText ?? descEl.textContent ?? "";
      const lower = html.toLowerCase();
      const reqIdx = lower.search(
        /\b(requirements|qualifications|what we are looking for|what you will bring|what you'll bring|must have)\b/,
      );
      if (reqIdx >= 0) {
        const slice = html.slice(reqIdx, reqIdx + 2500);
        splitBullets(slice).slice(0, 20).forEach((s) => requirements.push(s));
      }
      const prefIdx = lower.search(
        /\b(nice to have|preferred|bonus|pluses?)\b/,
      );
      if (prefIdx >= 0) {
        const slice = html.slice(prefIdx, prefIdx + 1500);
        splitBullets(slice).slice(0, 15).forEach((s) => preferred.push(s));
      }
    }

    return {
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      description: description || undefined,
      responsibilities: [],
      requirements: requirements.length ? requirements : bullets.slice(0, 15),
      preferredSkills: preferred,
      benefits: [],
      applyUrl: (document.querySelector("a.jobs-apply-button") as HTMLAnchorElement | null)?.href,
      url: window.location.href,
      source: "linkedin",
    } as any;
  },
};
