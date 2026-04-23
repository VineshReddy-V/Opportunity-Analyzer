/**
 * Greenhouse adapter for boards.greenhouse.io and *.greenhouse.io job pages.
 */
import type { SiteAdapter } from "./types";
import { textOrEmpty } from "./types";
import { splitBullets } from "../domUtils";

export const greenhouseAdapter: SiteAdapter = {
  id: "greenhouse",
  matches(hostname, url) {
    return (
      hostname.includes("greenhouse.io") ||
      /boards\.greenhouse\.io\/.+\/jobs\/\d+/.test(url)
    );
  },
  extract() {
    const title =
      textOrEmpty(document.querySelector(".app-title")) ||
      textOrEmpty(document.querySelector("h1"));
    const company =
      textOrEmpty(document.querySelector(".company-name")) ||
      textOrEmpty(document.querySelector(".main-header")) ||
      "";

    const location =
      textOrEmpty(document.querySelector(".location")) ||
      textOrEmpty(document.querySelector(".job__location"));

    const descEl =
      document.querySelector("#content") ??
      document.querySelector(".posting") ??
      document.querySelector("main");
    const description = textOrEmpty(descEl);

    const headings = Array.from(
      descEl?.querySelectorAll("h2, h3, h4") ?? [],
    ) as HTMLElement[];

    const bySection = (match: RegExp, cap = 15): string[] => {
      const idx = headings.findIndex((h) =>
        match.test((h.textContent ?? "").toLowerCase()),
      );
      if (idx < 0) return [];
      const start = headings[idx];
      const end = headings[idx + 1];
      const out: string[] = [];
      let el: Element | null = start.nextElementSibling;
      while (el && el !== end) {
        el.querySelectorAll("li, p").forEach((li) => {
          const t = (li.textContent ?? "").replace(/\s+/g, " ").trim();
          if (t.length > 4 && t.length < 280) out.push(t);
        });
        el = el.nextElementSibling;
      }
      return out.slice(0, cap);
    };

    const responsibilities = bySection(/responsibilities|what you.?ll do/, 12);
    const requirements = bySection(/requirements|qualifications|who you are/, 15);
    const preferred = bySection(/preferred|nice to have|bonus/, 10);
    const benefits = bySection(/benefits|perks/, 8);

    return {
      title: title || undefined,
      company: company || undefined,
      location: location || undefined,
      description: description || undefined,
      responsibilities,
      requirements: requirements.length ? requirements : splitBullets(description).slice(0, 12),
      preferredSkills: preferred,
      benefits,
      applyUrl: (document.querySelector(
        "a.btn-apply, a#apply_button, a[href*='application']",
      ) as HTMLAnchorElement | null)?.href,
      url: window.location.href,
      source: "greenhouse",
    } as any;
  },
};
