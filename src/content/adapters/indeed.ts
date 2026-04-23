/**
 * Indeed adapter.
 */
import type { SiteAdapter } from "./types";
import { collectTexts, textOrEmpty } from "./types";
import { splitBullets } from "../domUtils";

export const indeedAdapter: SiteAdapter = {
  id: "indeed",
  matches(hostname, url) {
    return hostname.includes("indeed.com") || /indeed\.com\/(viewjob|jobs)/.test(url);
  },
  extract() {
    const title =
      textOrEmpty(document.querySelector("h1[data-testid='jobsearch-JobInfoHeader-title']")) ||
      textOrEmpty(document.querySelector("h1"));
    const company = textOrEmpty(
      document.querySelector("[data-testid='inlineHeader-companyName']"),
    );
    const location = textOrEmpty(
      document.querySelector("[data-testid='inlineHeader-companyLocation']"),
    );
    const descEl =
      document.querySelector("#jobDescriptionText") ?? document.querySelector("main");
    const description = textOrEmpty(descEl);
    const bullets = collectTexts("ul li, ol li", descEl ?? document);
    return {
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      description: description || undefined,
      responsibilities: bullets.slice(0, 10),
      requirements: bullets.length
        ? bullets.slice(0, 15)
        : splitBullets(description).slice(0, 12),
      preferredSkills: [],
      benefits: [],
      applyUrl: (
        document.querySelector(
          "a[aria-label*='Apply'], button[aria-label*='Apply']",
        ) as HTMLAnchorElement | null
      )?.href,
      url: window.location.href,
      source: "indeed",
    } as any;
  },
};
