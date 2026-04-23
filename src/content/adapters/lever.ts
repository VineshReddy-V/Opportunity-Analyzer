/**
 * Lever adapter for jobs.lever.co and embedded Lever postings.
 */
import type { SiteAdapter } from "./types";
import { collectTexts, textOrEmpty } from "./types";
import { splitBullets } from "../domUtils";

export const leverAdapter: SiteAdapter = {
  id: "lever",
  matches(hostname, url) {
    return hostname.includes("lever.co") || /jobs\.lever\.co/.test(url);
  },
  extract() {
    const title =
      textOrEmpty(document.querySelector(".posting-headline h2")) ||
      textOrEmpty(document.querySelector("h2")) ||
      textOrEmpty(document.querySelector("h1"));
    const company =
      textOrEmpty(
        document.querySelector(".main-header-logo, .main-header-text"),
      ) ||
      textOrEmpty(document.querySelector(".header-logo-title")) ||
      "";
    const location = textOrEmpty(
      document.querySelector(".sort-by-time.posting-category.medium-category-label"),
    );

    const sections = document.querySelectorAll(".section");
    const responsibilities: string[] = [];
    const requirements: string[] = [];
    const preferred: string[] = [];
    const benefits: string[] = [];
    sections.forEach((sec) => {
      const heading = (
        sec.querySelector("h3, h4")?.textContent ?? ""
      ).toLowerCase();
      const bullets: string[] = [];
      sec.querySelectorAll("li, p").forEach((li) => {
        const t = (li.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t.length > 4 && t.length < 280) bullets.push(t);
      });
      if (/responsibilit|what you.?ll do/.test(heading))
        responsibilities.push(...bullets.slice(0, 12));
      else if (/requirement|qualification|minimum/.test(heading))
        requirements.push(...bullets.slice(0, 15));
      else if (/preferred|nice to have|bonus/.test(heading))
        preferred.push(...bullets.slice(0, 10));
      else if (/benefit|perk/.test(heading))
        benefits.push(...bullets.slice(0, 8));
    });

    const descEl =
      document.querySelector(".posting-page") ??
      document.querySelector(".section-wrapper") ??
      document.querySelector("main");
    const description = textOrEmpty(descEl);

    return {
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      description: description || undefined,
      responsibilities,
      requirements: requirements.length
        ? requirements
        : splitBullets(description).slice(0, 12),
      preferredSkills: preferred,
      benefits,
      applyUrl: (document.querySelector(
        "a.template-btn-submit, a[href*='apply']",
      ) as HTMLAnchorElement | null)?.href,
      url: window.location.href,
      source: "lever",
    } as any;
  },
};
