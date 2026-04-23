/**
 * Workday adapter. Workday DOM is dynamic and obfuscated; we use
 * role/aria hooks where possible.
 */
import type { SiteAdapter } from "./types";
import { collectTexts, textOrEmpty } from "./types";
import { splitBullets } from "../domUtils";

export const workdayAdapter: SiteAdapter = {
  id: "workday",
  matches(hostname, url) {
    return (
      hostname.includes("myworkdayjobs.com") ||
      hostname.includes("workday.com") ||
      /myworkdayjobs\.com/.test(url)
    );
  },
  extract() {
    const title =
      textOrEmpty(document.querySelector("[data-automation-id='jobPostingHeader']")) ||
      textOrEmpty(document.querySelector("h1, h2"));
    const company = (document.title?.split(" - ")[0] ?? "").trim();
    const location = textOrEmpty(
      document.querySelector("[data-automation-id='locations']"),
    );
    const descEl =
      document.querySelector("[data-automation-id='jobPostingDescription']") ??
      document.querySelector("main");
    const description = textOrEmpty(descEl);
    const bullets = collectTexts("li", descEl ?? document);
    return {
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      description: description || undefined,
      responsibilities: bullets.slice(0, 10),
      requirements: bullets.slice(0, 15),
      preferredSkills: [],
      benefits: [],
      applyUrl: (document.querySelector(
        "[data-automation-id*='apply'] a, a[data-automation-id*='apply']",
      ) as HTMLAnchorElement | null)?.href,
      url: window.location.href,
      source: "workday",
    } as any;
  },
};
