/**
 * Timeout and backoff helpers.
 */

import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_MS,
  BACKOFF_MAX_MS,
} from "./constants";

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Exponential backoff delay with symmetric jitter.
 * attempt=0 -> base, attempt=1 -> 2x base, etc., capped at BACKOFF_MAX_MS.
 */
export function backoffDelay(attempt: number): number {
  const exp = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, attempt),
    BACKOFF_MAX_MS,
  );
  const jitter = (Math.random() - 0.5) * 2 * BACKOFF_JITTER_MS;
  return Math.max(250, Math.round(exp + jitter));
}

/** Run a promise with a timeout; rejects with an Error if it exceeds ms. */
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeoutP]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
