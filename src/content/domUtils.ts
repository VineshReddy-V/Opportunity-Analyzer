/**
 * DOM utility helpers used by the content script.
 *
 * All helpers are defensive: pages can be weird, SPAs reload, adapters
 * may not apply. Every helper must be side-effect free and tolerant of
 * null/undefined elements.
 */

import { MAX_PAGE_TEXT_CHARS } from "@/shared/constants";

/** Extract visible text from an element, roughly reading-order. */
export function visibleText(
  root: Element | Document | null | undefined,
): string {
  if (!root) return "";
  const scope = (root as Document).body ?? (root as Element);
  if (!scope) return "";
  const walker = document.createTreeWalker(
    scope,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node) {
        const el = (node as Text).parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        const tag = el.tagName;
        if (
          tag === "SCRIPT" ||
          tag === "STYLE" ||
          tag === "NOSCRIPT" ||
          tag === "TEMPLATE" ||
          tag === "SVG" ||
          tag === "IFRAME"
        )
          return NodeFilter.FILTER_REJECT;
        if (el.closest("nav,footer,aside,header") && !el.closest("main,article"))
          return NodeFilter.FILTER_REJECT;
        const text = (node.nodeValue ?? "").trim();
        if (text.length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  const parts: string[] = [];
  let total = 0;
  let n = walker.nextNode();
  while (n && total < MAX_PAGE_TEXT_CHARS) {
    const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
    if (t) {
      parts.push(t);
      total += t.length + 1;
    }
    n = walker.nextNode();
  }
  return parts.join(" ").slice(0, MAX_PAGE_TEXT_CHARS);
}

/** Return headings text for h1..h3 in document order. */
export function collectHeadings(root: Element | Document): string[] {
  const qs = (root as Document).querySelectorAll?.bind(root) ??
    (root as Element).querySelectorAll.bind(root as Element);
  const list = qs("h1, h2, h3");
  const out: string[] = [];
  list.forEach((el) => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t && out.length < 20) out.push(t);
  });
  return out;
}

/** Parse all JSON-LD scripts and return objects + detected @type values. */
export function parseJsonLd(): { objects: any[]; types: string[] } {
  const objects: any[] = [];
  const types = new Set<string>();
  document
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((script) => {
      try {
        const raw = (script.textContent ?? "").trim();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((o) => {
            objects.push(o);
            pushType(types, o?.["@type"]);
          });
        } else {
          objects.push(parsed);
          pushType(types, parsed?.["@type"]);
          if (parsed?.["@graph"] && Array.isArray(parsed["@graph"])) {
            parsed["@graph"].forEach((o: any) => {
              objects.push(o);
              pushType(types, o?.["@type"]);
            });
          }
        }
      } catch {
        /* ignore malformed JSON-LD */
      }
    });
  return { objects, types: Array.from(types) };
}

function pushType(set: Set<string>, t: unknown) {
  if (!t) return;
  if (Array.isArray(t)) t.forEach((x) => pushType(set, x));
  else if (typeof t === "string") set.add(t);
}

export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Split a block of text into bullet-ish lines based on common patterns. */
export function splitBullets(text: string): string[] {
  const raw = text
    .split(/\n+|•|·|‣|–\s|—\s|\s\*\s|\s-\s/g)
    .map((s) => cleanWhitespace(s))
    .filter((s) => s.length > 4 && s.length < 260);
  // De-dup while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const key = r.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/**
 * Try to locate the main content root for a page using a small set of
 * heuristics. Returns the document body as a last resort.
 */
export function guessMainContentRoot(): Element {
  const selectors = [
    "main[role=main]",
    "main",
    "article[role=article]",
    "article",
    "[data-testid*=job]",
    "[data-test*=job]",
    "[class*=job-details]",
    "[class*=jobDetail]",
    "[class*=JobDetail]",
    "[class*=posting]",
    "section[aria-label*=job i]",
    "#content",
    ".content",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.textContent ?? "").trim().length > 400) return el;
  }
  return document.body ?? document.documentElement;
}
