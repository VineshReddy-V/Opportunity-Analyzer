# Opportunity Analyzer Agent — Gemini Free Tier Edition

A **local-first, rate-limit-aware Chrome MV3 extension** that analyzes the
current webpage against a stored candidate profile, produces a grounded fit
analysis, and drafts short application assets — all on top of the **free
Google Gemini Developer API** (Google AI Studio).

The architecture is deliberately designed around the free-tier's real-world
pain points: bursty 429s, per-project quotas, and fluctuating limits.
The extension:

- runs **on demand only** (no background scraping, no auto-triggering),
- **classifies** pages deterministically **before** spending any LLM budget,
- serializes runs through a **single-flight queue** with a **conservative
  rate budget manager**,
- uses **at most 2–3 Gemini calls per run** (normal mode) or **1–2** (minimal),
- applies **exponential backoff with jitter** on `429 / RESOURCE_EXHAUSTED`
  and **auto-downgrades to minimal mode** when usage gets tight,
- never sends raw DOM or full resumes to the LLM — only compact, normalized
  objects,
- persists everything locally (IndexedDB + `chrome.storage.local`).

## Screens

The side panel has three tabs:

1. **Analyze** — one-click "Analyze this page", live agent timeline, opportunity
   preview, fit summary, generated assets, and a Gemini Budget status card.
2. **Tracker** — local database of all analyzed opportunities with editable
   statuses (`saved` / `review_needed` / `ready_to_apply` / `applied` /
   `archived`).
3. **Settings** — Gemini API key, primary / fallback model, conservative RPM/
   TPM/RPD, safety reserve %, max LLM calls per run, auto-minimal toggle, and
   your local candidate profile summary.

---

## Project layout

```
opportunity-analyzer-agent/
├── manifest.config.ts            # MV3 manifest (built by @crxjs/vite-plugin)
├── vite.config.ts
├── tsconfig.json
├── package.json
├── README.md
├── docs/
│   └── ARCHITECTURE.md
└── src/
    ├── background/
    │   ├── worker.ts             # Service worker entry + message router
    │   ├── orchestrator.ts       # Drives state machine + agent loop
    │   ├── stateMachine.ts       # Typed FSM with legal-transition map
    │   ├── queueManager.ts       # Single-flight run queue
    │   ├── budgetManager.ts      # RPM/TPM/RPD + 429 backoff + mode switch
    │   ├── promptBuilder.ts      # Compact prompt templates (JSON-only)
    │   ├── geminiAdapter.ts      # Single choke point to Gemini API
    │   └── toolRegistry.ts       # 6 custom tools + timeline sink
    ├── content/
    │   ├── index.ts              # Injected on demand
    │   ├── classifier.ts         # Cheap deterministic page classifier
    │   ├── extractor.ts          # Generic + JSON-LD + site-adapter pipeline
    │   ├── manualSelection.ts    # User text-selection fallback
    │   ├── domUtils.ts
    │   └── adapters/
    │       ├── linkedin.ts greenhouse.ts lever.ts workday.ts indeed.ts
    │       ├── types.ts
    │       └── index.ts
    ├── sidepanel/
    │   ├── index.html main.tsx styles.css App.tsx
    │   ├── hooks/useBackgroundBridge.ts
    │   └── components/
    │       ├── AnalyzePanel.tsx QueueStatus.tsx BudgetStatus.tsx
    │       ├── Timeline.tsx TimelineStepCard.tsx
    │       ├── OpportunityPreview.tsx FitSummary.tsx GeneratedAssets.tsx
    │       ├── TrackerView.tsx SettingsView.tsx
    ├── storage/
    │   ├── idb.ts                # Dexie schema
    │   ├── stores.ts             # Typed helpers per table
    │   └── chromeStorage.ts      # chrome.storage.local wrappers
    ├── shared/
    │   ├── types.ts schemas.ts constants.ts
    │   ├── hashing.ts tokenEstimation.ts logger.ts
    │   ├── timeouts.ts messaging.ts
    └── tests/
        └── unit/
            ├── budgetManager.test.ts
            ├── classifier.test.ts
            ├── comparison.test.ts
            └── queueManager.test.ts
```

---

## Setup

### Prerequisites

- Node.js 18+ (recommended 20+)
- npm 9+
- Chrome or Edge with support for **Side Panel** (Chrome ≥ 114)

### Install dependencies

```bash
npm install
```

### Dev build (with HMR)

```bash
npm run dev
```

Then load the extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder produced by Vite

Vite will rebuild as you edit; just reload the extension in `chrome://extensions`
after changes to the background worker.

### Production build

```bash
npm run build
```

Output goes to `dist/` — same loading flow as above.

### Run tests

```bash
npm test
```

### Type-check

```bash
npm run typecheck
```

---

## Configuration

Open the side panel → **Settings** → **Gemini**:

1. Paste your **Google AI Studio API key**
   (get one at <https://aistudio.google.com/apikey>).
   Stored only in `chrome.storage.local` on this device.
2. Pick models:
   - Primary: `gemini-2.5-flash-lite` (recommended for free-tier workloads)
   - Fallback: `gemini-2.5-flash`
3. (Optional) Enable **Mock mode** to run the entire flow without any
   network calls — perfect for demos or when you've hit a quota.

Then **Settings → Budget**:

- Set conservative **RPM / TPM / RPD** values (defaults intentionally low).
- Keep a **safety reserve %** (default 25%) below your configured caps.
- **Auto minimal mode** is on by default — the agent will drop to 2 calls
  per run when overall budget usage crosses 70%.

Then **Settings → Profile**:

- Add target roles, top skills, experience years, and a short summary.
- Leave **Redacted mode** on to keep prompt payloads minimal.
  (The "Display name" field is **never** sent to Gemini.)

---

## How a run works

1. You click **Analyze this page** in the side panel.
2. The background worker enqueues the run (one active at a time).
3. The orchestrator transitions the FSM:

   `IDLE → BOOTSTRAP → CLASSIFY_PAGE → EXTRACT_PAGE → LOAD_PROFILE →
    COMPARE → PLAN_ANALYZE → (GENERATE_ASSETS) → SAVE_TRACKER → DONE`

   - The **content script** is injected *on demand* (`scripting.executeScript`).
   - Steps 1–4 are fully deterministic — no Gemini budget spent yet.
   - `classifyPage()` can **short-circuit** on irrelevant pages.
4. `PLAN_ANALYZE` is Gemini call #1: compact evidence in → strict-JSON fit
   analysis out. Recommendation ∈ `apply | tailor_then_apply | skip`.
5. If the LLM says `needsGeneration=true` **and** the budget permits, call #2
   generates a recruiter note + short application summary + 3 tailored bullets.
6. `SAVE_TRACKER` writes a `TrackerRecord` into IndexedDB (upserting on URL/
   title/company so duplicates merge).
7. The timeline is persisted to `tool_events` and streams live to the side
   panel.

---

## Icons (optional)

Icons are not bundled. To add them:

1. Drop `icon16.png`, `icon32.png`, `icon48.png`, and `icon128.png` into
   an `icons/` folder at the project root.
2. Re-enable the `icons: { ... }` block in `manifest.config.ts`.
3. Rebuild.

---

## Design choices & tradeoffs (short version)

- **Single-flight queue**: the free tier is bursty. Concurrency=1 inside the
  worker prevents multi-tab stampedes and makes 429s rare.
- **Deterministic first, LLM second**: page classification, extraction,
  profile loading, and fit scoring are all pure functions. Gemini is only
  used for *explanation* and *short asset generation*, never for structural
  extraction.
- **Strict JSON out (`responseMimeType: application/json`)**: keeps outputs
  small and parseable. Reduces retries.
- **Prompt compression**: we never ship raw DOM or full resumes. Schemas in
  `promptBuilder.ts` cap list sizes and string lengths.
- **Conservative budgets**: default RPM=10, TPM=120k, RPD=200 with a 25%
  safety reserve. Users can raise these in Settings.
- **Graceful degradation**: when usage crosses 70%, the agent auto-switches
  to minimal mode (2 calls). Above 85%, optional generation is skipped and
  only the deterministic fit + short analysis are returned.
- **Local-first storage**: IndexedDB for runtime data (tracker, runs, tool
  events, snapshots, budget events), `chrome.storage.local` for small typed
  config (API key, budget, profile, prefs). No backend.
- **Content script on demand**: injected per run, short-lived, never scrapes
  in the background. Satisfies spec §4.1.
- **Permissions principle**: `activeTab` + `scripting`; no broad host perms
  outside `generativelanguage.googleapis.com`.

The full design doc lives at `docs/ARCHITECTURE.md`.

---

## Assignment mapping

| Requirement | Where it lives |
|---|---|
| Multiple LLM calls | `orchestrator.ts` runs 1–2 Gemini calls (hard-capped at 3) per run |
| Stored history per query | `runs`, `tool_events`, `page_snapshots`, `draft_assets` in IndexedDB |
| Reasoning chain display | `Timeline.tsx` + `TimelineStepCard.tsx` (each step shows name, status, reasoning summary, args, results) |
| Tool calls & results | `toolRegistry.ts` records every tool/LLM event with args + result previews |
| At least 3 custom tools | 6 tools: `classifyCurrentPage`, `extractOpportunityFromPage`, `loadCandidateProfile`, `compareProfileToOpportunity`, `generateApplicationAssets`, `saveTrackerRecord` |
| 429 handling + queueing | `budgetManager.onRateLimit` + `queueManager.ts` + `geminiAdapter.ts` |
| Settings panel | `SettingsView.tsx` covers API key, models, budget, profile |

---

## Troubleshooting

- **"Cannot inject on this page"**: internal pages (`chrome://`, Web Store,
  PDF viewer) are off-limits by design. Open a normal webpage.
- **"Gemini API key is not set"**: open Settings → Gemini and paste your key.
- **429 / RESOURCE_EXHAUSTED**: expected on free tier. The Budget Status card
  will show a backoff countdown; the agent waits and then retries with
  minimal mode. You can also tighten the RPM/RPD to avoid hitting it.
- **Extraction low confidence**: select the main job text on the page and
  re-run — the extractor will prefer user-selected text when ≥ 200 chars.

---

## License

MIT — see `LICENSE` if you add one. For course / assignment use, no
additional restrictions.
