/**
 * Minimal "manual selection" helper.
 *
 * When automatic extraction is low confidence, we ask the user to select
 * the main job description text on the page and press Cmd/Ctrl+Enter to
 * submit it. We take the current selection and return it to the caller.
 *
 * We intentionally do NOT add a fancy overlay here in v0.1; the host page
 * styling varies wildly and any overlay would need careful CSP handling.
 */

export function getSelectionOrEmpty(): string {
  const sel = window.getSelection?.();
  const text = sel ? sel.toString() : "";
  return (text ?? "").trim();
}
