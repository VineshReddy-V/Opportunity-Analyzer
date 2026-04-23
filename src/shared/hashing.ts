/**
 * Minimal hashing helpers.
 *
 * We intentionally avoid pulling in a crypto library; djb2 is plenty
 * for deduping extraction cache entries by URL + content.
 */

/** Stable djb2 hash as a lowercase hex string. */
export function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and to hex.
  return (h >>> 0).toString(16);
}

/** Combine multiple strings into a single djb2 hash. */
export function hashParts(...parts: (string | undefined | null)[]): string {
  return djb2(parts.map((p) => p ?? "").join("\u0001"));
}

/** Normalize URL by stripping query params that are usually tracking. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const noisyParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
      "ref",
      "refId",
      "referrer",
      "trk",
      "trkCampaign",
    ];
    noisyParams.forEach((p) => u.searchParams.delete(p));
    // Drop fragment identifiers.
    u.hash = "";
    // Lowercase hostname.
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return raw;
  }
}

/** Cheap normalization of titles/company names for duplicate detection. */
export function normalizeName(raw: string | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}
