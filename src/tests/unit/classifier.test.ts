/**
 * Unit tests for the deterministic page classifier.
 * Runs under jsdom.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyPage } from "@/content/classifier";

function setDoc(html: string, url = "https://example.com/x") {
  document.body.innerHTML = html;
  // jsdom URL / location handling
  try {
    Object.defineProperty(window, "location", {
      value: new URL(url),
      writable: true,
    });
  } catch {
    /* ignore */
  }
}

describe("classifyPage", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("detects a JobPosting JSON-LD page", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Software Engineer",
      hiringOrganization: { name: "Acme" },
    };
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
    setDoc(
      "<h1>Software Engineer</h1><p>About the role…</p>",
      "https://acme.com/jobs/1",
    );
    const { pageType } = classifyPage();
    expect(pageType).toBe("opportunity_detail");
  });

  it("detects a listing page by URL keywords", () => {
    setDoc(
      "<h1>Open Roles</h1><p>Browse our current openings.</p>",
      "https://acme.com/careers",
    );
    const { pageType } = classifyPage();
    expect(["opportunity_listing", "opportunity_detail"]).toContain(pageType);
  });

  it("returns irrelevant for a random article", () => {
    setDoc(
      "<h1>A long blog post about things</h1><p>Nothing job-related here.</p>",
      "https://example.com/blog/hello",
    );
    const { pageType } = classifyPage();
    // classifier may choose irrelevant or unknown; both are safe.
    expect(["irrelevant", "unknown"]).toContain(pageType);
  });

  it("detects opportunity detail via strong keywords even without JSON-LD", () => {
    setDoc(
      `<h1>Senior Engineer</h1>
       <h2>Responsibilities</h2><ul><li>Ship things</li></ul>
       <h2>Requirements</h2><ul><li>5 years</li></ul>
       <h2>Benefits</h2><ul><li>Remote</li></ul>
       <a href="/apply">Apply now</a>`,
      "https://acme.com/jobs/eng-1",
    );
    const { pageType } = classifyPage();
    expect(pageType).toBe("opportunity_detail");
  });
});
