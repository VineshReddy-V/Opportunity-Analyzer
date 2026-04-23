/**
 * Heuristic token estimation.
 *
 * We do not have a real tokenizer at runtime and we do not need one.
 * Gemini models roughly tokenize at ~4 characters per token for English
 * text, so this heuristic is a conservative approximation used by the
 * BudgetManager before it decides whether to allow a call.
 */

/** Approximate input tokens for a given string. Conservative (rounds up). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Slight bias toward over-estimation so we stay under real quota.
  return Math.ceil(text.length / 3.7);
}

/** Approximate tokens for a structured object (JSON.stringify path). */
export function estimateObjectTokens(obj: unknown): number {
  try {
    return estimateTokens(JSON.stringify(obj));
  } catch {
    return 0;
  }
}
