# Architecture — Opportunity Analyzer Agent

This document describes the runtime shape of the extension so future
contributors don't have to reconstruct it from code.

## 1. High-level picture

```text
+-------------------------+         +-----------------------------+
| React Side Panel UI     |  <----> | Background Service Worker   |
| - AnalyzePanel          |         |  - Run Queue                |
| - Timeline/FitSummary/… |         |  - Budget Manager           |
+-----------+-------------+         |  - Agent Orchestrator (FSM) |
            ^                       |  - Tool Registry            |
            |                       |  - Gemini Adapter           |
            |  chrome.runtime msgs  +---+-------------+-----------+
            |                           |             |
            |                           v             v
            |                 +---------+--+    +-----+--------+
            |                 | IndexedDB  |    | chrome.      |
            |                 | (Dexie)    |    | storage.local|
            |                 +------------+    +--------------+
            |
            | chrome.scripting.executeScript (on demand)
            v
+-------------------------+
| Content Script (short)  |
|  - classify + extract   |
+-------------------------+
```

## 2. Run lifecycle (happy path)

State machine in `src/background/stateMachine.ts`:

```
IDLE -> BOOTSTRAP -> CLASSIFY_PAGE -> EXTRACT_PAGE -> LOAD_PROFILE
     -> COMPARE -> PLAN_ANALYZE -> (GENERATE_ASSETS) -> SAVE_TRACKER -> DONE
```

Additional states: `RATE_LIMIT_BACKOFF`, `NEEDS_USER_INPUT`, `CANCELLED`,
`ERROR`, `QUEUE_WAIT`. Illegal transitions soft-fail into `ERROR`.

Each state transition emits a `state` event into the timeline so the UI
can display the current step.

## 3. Budget manager

`src/background/budgetManager.ts`

Signals tracked:
- Rolling **RPM** window (60s)
- Rolling **TPM** window (60s, approximate)
- Rolling **RPD** window (24h)
- Active **backoffUntil** timestamp
- Recent 429 timestamps
- Current mode: `normal | minimal`

On every `shouldAllowCall(estTokens)` the manager returns one of:

| Decision | Meaning |
|---|---|
| `allow` | Fire the request now |
| `delay` | Sleep `delayMs` and re-ask |
| `downgrade` | Switch to minimal mode; caller may fire one more reduced call |
| `reject` | Daily cap reached; surface error to UI |

Effective caps = `configured * (1 - safetyReservePct/100)`.

Concurrency is forced to 1 by `inFlight > 0`.

On 429 / 503: `onRateLimit(attempt)` records a budget event, sets
`backoffUntil = now + exponentialBackoff + jitter` (capped at 60s), and
flips mode to `minimal` if we were in `normal`.

## 4. Queue manager

`src/background/queueManager.ts`

- Single active item, FIFO queue behind it.
- `enqueue()` returns `{ queued: true }` when another run is active — the
  UI uses this to show "queued" status.
- `cancel(runId)` works for both queued and active items. Active items
  read `cancelSignal()` in the orchestrator between steps.

## 5. Gemini adapter

`src/background/geminiAdapter.ts`

- Single choke point for the `generateContent` endpoint.
- Generation config: `responseMimeType: "application/json"`, `temperature: 0.2`,
  modest `maxOutputTokens`.
- Before each call: `budgetManager.shouldAllowCall()` decides
  allow/delay/downgrade/reject. Loop with bounded iterations to avoid
  infinite delay spirals.
- On `429 / 503`: parse `RetryInfo.retryDelay` when available, merge with
  our backoff, then retry. After `MAX_GEMINI_RETRIES` on primary model,
  automatically tries the fallback model once.
- Errors surfaced to UI are sanitized — API keys in URLs are stripped.
- Mock mode returns deterministic JSON so the whole pipeline can be
  demonstrated without network.

## 6. Tool registry

`src/background/toolRegistry.ts`

Six tools (spec §14):

| # | Tool | Gemini? | Notes |
|---|---|---|---|
| 1 | `classifyCurrentPage` | no | Deterministic; content script |
| 2 | `extractOpportunityFromPage` | no | Adapter or generic; confidence + warnings |
| 3 | `loadCandidateProfile` | no | `chrome.storage.local` |
| 4 | `compareProfileToOpportunity` | no | 50/20/20/10 weighted score |
| 5 | `generateApplicationAssets` | yes | Gemini call #2 (optional) |
| 6 | `saveTrackerRecord` | no | IndexedDB upsert with dedup |

Every tool (and LLM) call is written to the `tool_events` table and
broadcast to the side panel in real time.

## 7. Prompt compression

`src/background/promptBuilder.ts`

- Never ships raw DOM.
- Compact objects with strict per-field length caps.
- Strict JSON output schemas, described inline as part of the prompt.
- Agent history passes through `compactHistory()` — only reasoning
  summaries survive, not full tool outputs.

## 8. Deterministic fit scoring

`compareProfileToOpportunity()`:

```
score = 50 * reqOverlap
      + 20 * preferredOverlap
      + 20 * titleSimilarity (Jaccard over tokens)
      + 10 * experienceSignal (above=1 / match=0.8 / below=0.2 / unknown=0.5)
```

Recommendation mapping used by `PLAN_ANALYZE` prompt:

| Score | Recommendation |
|---|---|
| ≥ 65 and no critical gap | `apply` |
| 40–64 | `tailor_then_apply` |
| < 40 or missing critical req | `skip` |

## 9. Storage

### IndexedDB (Dexie)
Tables:
- `tracker_records` — primary tracker, upsert-deduplicated by URL/title/company
- `runs` — one row per run
- `tool_events` — timeline events
- `page_snapshots` — raw signals at extraction time
- `draft_assets` — generated asset drafts per run
- `cache_entries` — url+contentHash → extracted opportunity (future use)
- `budget_events` — 429s, decisions, backoff — bounded to 500 rows

### `chrome.storage.local`
- `geminiSettings` (api key, models, mockMode)
- `rateBudgetConfig` (RPM/TPM/RPD, safety reserve, max calls)
- `candidateProfileSummary` (local profile)
- `uiPrefs`

## 10. Extensibility

- **New adapter**: add a file in `src/content/adapters/`, export a
  `SiteAdapter`, register it in `src/content/adapters/index.ts`.
- **New tool**: implement it in `toolRegistry.ts`, ensure it writes a
  `tool_events` entry via `TimelineSink`, and include it in the
  orchestrator's state machine.
- **Different provider**: swap `geminiAdapter.ts`. The rest of the
  pipeline depends only on `prompt → JSON` contracts.

## 11. Security notes

- API keys are stored in `chrome.storage.local`, never in IndexedDB, never
  logged in error messages (adapter sanitizes URLs).
- The extension asks for the **minimum** permissions needed: `activeTab`,
  `scripting`, `storage`, `sidePanel`, `contextMenus`. The only host
  permission is `https://generativelanguage.googleapis.com/*`.
- The "Display name" field in the profile is never included in any prompt.
- In redacted mode, the profile summary sent to Gemini is truncated to
  ~400 chars.

## 12. Known limitations / roadmap

- Site adapters (especially Workday, LinkedIn) depend on DOM that changes
  frequently; tests use fixtures to guard the generic extractor, not the
  specific adapters.
- The manual-selection fallback is minimal (reads `window.getSelection()`);
  a visual overlay could be added later via a web-accessible stylesheet.
- Listing-page handling is deliberately simple: we stop and ask the user
  to open a specific role.
- Multi-language pages are not optimized (keyword heuristics are English).
