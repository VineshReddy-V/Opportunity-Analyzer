/**
 * Common types and helpers for site adapters.
 */

import type { OpportunityFact } from "@/shared/types";

export interface SiteAdapter {
  /** Adapter id, also used as `source` on the OpportunityFact. */
  id: string;
  /** Does this adapter apply to the current hostname + URL? */
  matches(hostname: string, url: string): boolean;
  /** Extract a normalized OpportunityFact. */
  extract(): Partial<OpportunityFact> | null;
}

export function textOrEmpty(el: Element | null | undefined): string {
  if (!el) return "";
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function collectTexts(
  selector: string,
  root: Element | Document = document,
): string[] {
  const out: string[] = [];
  root.querySelectorAll(selector).forEach((el) => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t && t.length > 2 && t.length < 300) out.push(t);
  });
  return out;
}
