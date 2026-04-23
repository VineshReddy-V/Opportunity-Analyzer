/**
 * Central registry of adapters. Order matters: first match wins.
 */
import { greenhouseAdapter } from "./greenhouse";
import { indeedAdapter } from "./indeed";
import { leverAdapter } from "./lever";
import { linkedInAdapter } from "./linkedin";
import { workdayAdapter } from "./workday";
import type { SiteAdapter } from "./types";

export const ADAPTERS: SiteAdapter[] = [
  linkedInAdapter,
  greenhouseAdapter,
  leverAdapter,
  workdayAdapter,
  indeedAdapter,
];

export function findAdapter(
  hostname: string,
  url: string,
): SiteAdapter | null {
  for (const a of ADAPTERS) {
    try {
      if (a.matches(hostname, url)) return a;
    } catch {
      /* ignore broken adapter match */
    }
  }
  return null;
}
