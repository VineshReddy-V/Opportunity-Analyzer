# Chrome Agentic AI Plugin — Build Specification (Gemini Free Tier Optimized)

## Project Name
**Opportunity Analyzer Agent — Gemini Free Tier Edition**  
_A Chrome Extension (Manifest V3) designed specifically for the **free Google Gemini Developer API / Google AI Studio** path, with an architecture optimized to avoid rate-limit errors, reduce token waste, minimize browser overhead, and still satisfy the assignment’s multi-step agent requirements._

---

## 1) Build Goal
Build a **robust, local-first, rate-limit-aware Chrome extension** that:

- analyzes the **current webpage** as a job/opportunity page
- compares it against a stored candidate profile
- produces a grounded fit analysis
- generates concise application assets
- shows a transparent agent execution timeline
- persists outcomes into a local tracker
- uses the **free Google Gemini API** safely and efficiently

This specification is the **source of truth** for the coding agent.

---

## 2) Key Platform Assumptions (Gemini-Specific)
This architecture is intentionally designed around the current **Gemini Developer API free tier** behavior:

1. **Free tier rate limits vary by model and are not guaranteed**; active limits should be read from **Google AI Studio** for the exact project/model being used.
2. Gemini rate limits are enforced across multiple dimensions such as **RPM**, **TPM**, and **RPD**.
3. Gemini rate limits are applied **per project, not per API key**.
4. Free tier only provides **limited access to certain models**.
5. Free-tier usage may have different privacy characteristics than paid usage; therefore the extension must keep prompts minimal and allow redacted profile input.

### Design consequence
The extension **must not assume static quotas**. Instead it must:
- treat quotas as **configurable runtime constraints**
- aggressively reduce unnecessary LLM calls
- avoid prompt bloat
- serialize requests conservatively
- degrade gracefully when nearing limits

---

## 3) Product Positioning
The extension should be implemented as **Opportunity Analyzer Agent**, not just “Job Apply Bot”.

### Supported page types
- job posting page
- internship page
- fellowship/program page
- freelance/contract opportunity page
- listing page containing multiple roles
- irrelevant/non-opportunity page (gracefully handled)

### Core user request
> “Analyze this page, tell me whether it matches my profile, summarize strengths and gaps, draft a concise recruiter/application note, and save it.”

---

## 4) Non-Negotiable Design Principles

## 4.1 Browser performance principles
The extension must not noticeably slow browsing.

**Rules:**
1. No continuous scraping.
2. No auto-analysis on tab change or page load.
3. Inject content scripts **only on demand**.
4. Use a **cheap classifier first**, deep extraction second.
5. Keep content script lifetime short.
6. Never send raw full DOM to the LLM.
7. Persist and reuse cached extraction by URL + content hash.
8. Provide cancel support for long operations.
9. No parallel heavy tasks in the browser.
10. All extraction must be deterministic-first.

## 4.2 Gemini free-tier survival principles
These are critical.

1. **Default LLM concurrency = 1**.
2. **One active agent run at a time** by default.
3. Hard cap the number of Gemini calls per run.
4. Prefer **Gemini Flash-Lite class models** for orchestration/summarization when available.
5. Avoid Pro/preview dependence in the default flow.
6. Reduce prompt size at every step.
7. Never resend unchanged long content.
8. Use deterministic preprocessing and scoring to save requests.
9. Use backoff + jitter on 429/RESOURCE_EXHAUSTED.
10. Queue runs instead of firing in parallel.
11. Stop early on irrelevant pages before any expensive LLM work.
12. If budget is low, switch to “minimal mode” instead of failing noisily.

## 4.3 Reliability principles
1. Always classify page type before extraction.
2. Every extractor returns confidence + warnings.
3. Low-confidence extraction must trigger fallback or user confirmation.
4. Separate extraction, comparison, and generation.
5. Persist every run and every tool event.
6. Use deterministic scoring before LLM explanation.

## 4.4 Privacy principles
1. Store profile locally.
2. Allow user to store a **redacted profile summary** instead of a full resume.
3. Send only minimum required text to Gemini.
4. Do not auto-send emails/messages.
5. Include a visible note in settings that free-tier prompts may have different data-use characteristics than paid usage.

---

## 5) Assignment Requirements Mapping

### Requirement: multiple LLM calls
Implemented using a **rate-limited agent loop** with **2–3 Gemini calls per run** under normal conditions.

### Requirement: each query stores all prior interaction
Persist in local storage:
- user prompt
- page summary
- LLM outputs
- tool calls
- tool results
- final answer

### Requirement: display reasoning chain
Show concise reasoning summaries, for example:
- “Page classified as likely opportunity detail page”
- “Extracted title/company/requirements with medium confidence”
- “Compared against stored candidate profile and identified skill gaps”
- “Generated concise outreach note”

### Requirement: show tool calls and results
Each timeline step must show:
- step number
- tool name
- sanitized arguments
- status
- duration
- result preview

### Requirement: at least 3 custom tools
This design includes **6 custom tools**.

---

## 6) Gemini-Free-Tier-Optimized Architecture

```text
Side Panel UI
   ↓
Background Service Worker
   ├─ Run Queue + Rate Budget Manager
   ├─ Agent Orchestrator + State Machine
   ├─ Tool Registry
   ├─ Gemini Adapter
   └─ Storage Layer
          ├─ chrome.storage.local
          └─ IndexedDB
   ↓
On-demand Content Script
```

### Core components
1. **Side Panel UI**
   - main UX
   - one-click analyze
   - run timeline
   - extracted data preview
   - tracker view
2. **Background Service Worker**
   - central orchestration
   - queue management
   - rate-limit enforcement
   - state machine transitions
   - persistence
3. **Gemini Budget Manager**
   - tracks request count, estimated tokens, recent 429s
   - decides whether to allow, delay, downgrade, or reject a new LLM call
4. **Gemini Adapter**
   - provider-specific request/response handling
   - strict JSON output contract
   - retry with backoff
   - model fallback logic
5. **Content Script**
   - lightweight classification
   - deterministic extraction
   - optional manual selection
6. **Storage Layer**
   - local-first persistence

---

## 7) Most Important Architecture Change From the Original Version
The architecture is now **Gemini quota aware**.

### New mandatory modules
1. **Run Queue**
   - runs are queued, not executed concurrently
2. **Rate Budget Manager**
   - prevents bursts
3. **Prompt Compressor**
   - trims history + page content before each Gemini call
4. **Model Router**
   - selects the cheapest suitable Gemini model allowed on free tier
5. **Graceful Degradation Manager**
   - switches to fewer-step mode if budget is low

This is what keeps the extension usable on the free tier.

---

## 8) LLM Call Budget Strategy
This project must explicitly control call count per run.

### Normal mode (default)
Use **maximum 3 Gemini calls per run**.

#### Call 1 — Plan
Input:
- user request
- lightweight page summary
- available tools
- previous run context for this page if any

Output:
- high-level plan
- next tool(s) to call

#### Call 2 — Grounded analysis
Input:
- extracted opportunity object
- candidate profile
- deterministic comparison result
- prior run history

Output:
- fit explanation
- recommendation
- whether generation step is needed

#### Call 3 — Final generation
Input:
- grounded analysis + key facts

Output:
- concise final answer
- recruiter/application note
- 3 tailored bullets

### Minimal mode (fallback when rate budget is tight)
Use **maximum 2 Gemini calls per run**.

#### Call 1
Plan + analyze in one step after deterministic extraction.

#### Call 2
Generate final response/assets.

### Hard rule
Do not exceed **3 Gemini calls per run** except in an explicit retry path after a recoverable parsing/provider error.

---

## 9) Model Routing Strategy (Gemini-Specific)

### Default model preference
The coding agent must implement configurable model routing.

#### Primary preference order
1. `gemini-2.5-flash-lite` (preferred default if available)
2. `gemini-2.5-flash`
3. another free-tier Flash/Flash-Lite model detected at runtime

### Why
- Flash-Lite-class models are optimized for **high-volume / cost-sensitive / lightweight agentic tasks**.
- The extension’s default workload is mostly:
  - classification support
  - concise planning
  - structured JSON responses
  - summarization/generation over already reduced content

### Do not default to
- Pro models
- preview-only models required for core function
- expensive or quota-fragile models

### Runtime detection requirement
At startup, the extension should be able to load and cache:
- configured model name
- fallback model name
- optional available-model metadata
- optional manually entered RPM/TPM/RPD budget values from settings

If runtime introspection of rate limits is unavailable, the extension must rely on **user-configured conservative budget settings**.

---

## 10) Rate Budget Manager (Critical)
Implement a dedicated **GeminiBudgetManager** in the background worker.

### Responsibilities
1. Track rolling request counts
2. Track estimated token usage
3. Track per-run call count
4. Track recent 429 events
5. Decide whether a call is:
   - allowed immediately
   - delayed
   - downgraded to minimal mode
   - rejected with user-facing explanation

### Input signals
- configured RPM budget
- configured TPM budget
- configured RPD budget
- recent request timestamps
- estimated tokens for next call
- number of queued runs
- failure/backoff state

### Required behavior
- default to **conservative limits**, not optimistic ones
- hold a **safety reserve** (for example 20–30%) instead of using full theoretical quota
- prevent multiple tabs from competing unpredictably
- make decisions centrally in the service worker

### Example policies
- allow only **1 active Gemini request at a time**
- if budget usage crosses 70%, switch to minimal mode
- if budget usage crosses 85%, disable optional generation and return core analysis only
- after a 429, apply exponential backoff with jitter and temporarily reduce allowed throughput

---

## 11) Queueing and Concurrency Strategy
To avoid free-tier burst errors, this extension must use a **single-run queue** by default.

### Rules
1. Only one run may actively execute Gemini calls at a time.
2. Other runs remain queued.
3. Deterministic extraction may happen before queue entry only if cheap.
4. If user starts a second run while one is active:
   - show queued status
   - allow cancel/reorder

### Why
Gemini quotas are project-level and bursty multi-tab traffic can cause 429s even when total usage looks small.

---

## 12) Prompt Size and Token Minimization Strategy
This is mandatory for free-tier viability.

### 12.1 Never send full DOM
Instead send only a compact normalized object such as:
- title
- company
- location
- top 10–20 requirements
- top responsibilities
- brief description summary
- confidence/warnings

### 12.2 Compress history
Only include:
- original user request
- prior reasoning summaries
- tool outputs in compressed JSON form
- no repeated long content

### 12.3 Structured prompts only
Use strict JSON outputs.
This reduces verbose model responses and parsing waste.

### 12.4 Limit generated text length
- recruiter note: short
- application summary: short
- final answer: concise

### 12.5 Tool result canonicalization
Before passing tool results to Gemini, normalize them into compact schemas.

---

## 13) Two-Pass Execution Model

### Pass A — Cheap classification (deterministic)
On demand, content script collects only:
- URL
- title
- hostname
- top headings
- small visible text sample
- metadata / JSON-LD presence

Then `classifyCurrentPage` returns:
- `opportunity_detail`
- `opportunity_listing`
- `company_page`
- `unknown`
- `irrelevant`

If irrelevant:
- stop early
- do not spend Gemini budget unless user forces manual mode

### Pass B — Deep extraction (deterministic)
Only for relevant pages:
- site adapter if recognized domain
- else generic extractor
- then normalize + compute confidence

Only after this should Gemini be used.

---

## 14) Custom Tools (Structured JSON Only)

### Tool 1 — `classifyCurrentPage`
Purpose: cheap page-type classification using deterministic signals.

### Tool 2 — `extractOpportunityFromPage`
Purpose: deep extraction of normalized opportunity data.

### Tool 3 — `loadCandidateProfile`
Purpose: load locally stored redacted/full candidate profile summary.

### Tool 4 — `compareProfileToOpportunity`
Purpose: deterministic fit scoring before any LLM explanation.

### Tool 5 — `generateApplicationAssets`
Purpose: create concise recruiter note + short application summary + 3 bullets.

### Tool 6 — `saveTrackerRecord`
Purpose: persist a tracker record locally.

### Important implementation note
Tools 1–4 and 6 should be primarily deterministic.  
Tool 5 may internally use Gemini, but only through the centralized budget manager.

---

## 15) Agent Loop (Updated for Quota Efficiency)
The orchestrator must not perform the naive pattern of one LLM call after every tool call if that would waste quota.

### Preferred execution flow
1. User starts run
2. Deterministic `classifyCurrentPage`
3. Deterministic `extractOpportunityFromPage`
4. Deterministic `loadCandidateProfile`
5. Deterministic `compareProfileToOpportunity`
6. Gemini Call 1: planning/analysis over compact data
7. Optional Gemini Call 2: final generation
8. `saveTrackerRecord`
9. render final result

### Why this still satisfies the assignment
The extension still uses:
- multiple LLM calls
- full stored history per call
- explicit tool calls/results
- visible reasoning timeline

But it avoids wasting the free-tier quota on unnecessary back-and-forth.

---

## 16) State Machine
Implement worker orchestration as a state machine.

### States
- `IDLE`
- `BOOTSTRAP`
- `QUEUE_WAIT`
- `CLASSIFY_PAGE`
- `EXTRACT_PAGE`
- `LOAD_PROFILE`
- `COMPARE`
- `PLAN_ANALYZE`
- `GENERATE_ASSETS`
- `SAVE_TRACKER`
- `DONE`
- `ERROR`
- `NEEDS_USER_INPUT`
- `CANCELLED`
- `RATE_LIMIT_BACKOFF`

### Notes
- `RATE_LIMIT_BACKOFF` is new and required.
- UI should reflect queued/backoff status clearly.

---

## 17) Storage Design
Use a **local-first** design.

### 17.1 `chrome.storage.local`
Use for:
- Gemini settings
- chosen model(s)
- conservative budget config
- candidate profile summary
- UI preferences
- feature flags

### Example keys
- `geminiSettings`
- `candidateProfileSummary`
- `uiPrefs`
- `rateBudgetConfig`

### 17.2 IndexedDB
Use for:
- `tracker_records`
- `runs`
- `tool_events`
- `page_snapshots`
- `draft_assets`
- `cache_entries`
- `budget_events`

### New store: `budget_events`
Purpose:
- persist 429 incidents
- backoff windows
- recent budget decisions
- diagnostic stats for demo/debugging

---

## 18) Tracker (Explicit Definition)
The **tracker** is the extension’s persistent local database of analyzed opportunities.
It stores:
- extracted opportunity metadata
- fit analysis
- generated assets
- status
- run link
- confidence + warnings

### Tracker statuses
- `saved`
- `review_needed`
- `ready_to_apply`
- `applied`
- `archived`

### Duplicate policy
Detect duplicates using:
- normalized URL
- normalized title
- normalized company

Update existing record instead of always creating a new one.

---

## 19) Privacy-Safe Candidate Profile Design
Because this version targets the **free Gemini path**, do not require the user to upload a full resume to the LLM flow.

### Recommended approach
Store a **structured profile summary** locally:
- target roles
- experience years
- top skills
- selected project highlights
- preferred locations (optional)
- concise summary paragraph

### Optional advanced mode
Allow user to upload a resume only for local parsing/extraction, then store the normalized summary locally.  
Do not repeatedly send the full resume text to Gemini.

---

## 20) Site Extraction Strategy
Use a layered extraction pipeline.

### Layer 1 — structured metadata
- JSON-LD
- schema.org
- title/meta tags
- canonical URL

### Layer 2 — semantic DOM sections
- responsibilities
- requirements
- qualifications
- skills
- apply
- experience

### Layer 3 — main content extraction
remove:
- nav/footer
- banners
- sidebars
- unrelated chrome

### Layer 4 — site adapters
Adapters for:
- LinkedIn Jobs
- Greenhouse
- Lever
- Workday
- Indeed

### Layer 5 — manual fallback
If confidence is low, ask user to select the main section manually.

---

## 21) Error Handling and Corner Cases

### Non-opportunity page
- stop early
- do not consume Gemini unless user insists

### Listing page
- extract visible role cards
- let user choose one
- then continue

### Missing company/title
- infer carefully
- mark as inferred
- request confirmation if saving

### Missing profile
- stop and ask user to create profile summary

### Dynamic page
- short DOM-stability wait only
- retry once
- then manual mode

### Duplicate analysis
- reuse cached extraction if URL + content hash matches

### 429 / RESOURCE_EXHAUSTED
- enter `RATE_LIMIT_BACKOFF`
- exponential backoff + jitter
- downgrade to minimal mode
- show user clear explanation

### Daily budget nearly exhausted
- skip optional generation
- still show extraction + deterministic fit summary

---

## 22) Required Settings Panel
The coding agent must implement a simple settings section.

### Required settings
1. Gemini API key
2. Primary model name
3. Fallback model name
4. Conservative RPM limit
5. Conservative TPM limit
6. Conservative RPD limit
7. Safety reserve percent
8. Max Gemini calls per run
9. Enable minimal mode automatically
10. Redacted profile mode toggle

### Defaults
Defaults must be conservative and safe for free-tier prototyping.

---

## 23) Gemini Adapter Requirements
The Gemini adapter must:
- support strict JSON responses
- centralize all provider calls
- estimate token usage before sending
- integrate with the budget manager
- support retry with backoff
- support mock mode for testing
- sanitize errors for UI display

### Strong recommendation
Use a **single prompt template family** for all Gemini calls to make outputs predictable and compact.

---

## 24) Deterministic Scoring Before LLM Explanation
Fit score must not be pure model opinion.

### Suggested weighted scoring
- 50% required skill overlap
- 20% preferred skill overlap
- 20% role/title similarity
- 10% experience/other cues

### LLM role
- explain fit/gaps
- produce concise recommendation wording
- generate short application assets

---

## 25) UI Requirements

### Side panel sections
1. Analyze panel
2. Run queue status
3. Agent timeline
4. Opportunity preview
5. Fit summary
6. Generated assets
7. Tracker
8. Gemini budget status

### Budget status card (new)
Show:
- current mode: normal/minimal/backoff
- active model
- queued runs count
- recent 429 indicator
- budget health: healthy / constrained / exhausted

This is excellent for demo and debugging.

---

## 26) Folder Structure

```text
opportunity-analyzer-agent/
  manifest.json
  package.json
  src/
    background/
      worker.ts
      orchestrator.ts
      stateMachine.ts
      toolRegistry.ts
      queueManager.ts
      budgetManager.ts
      geminiAdapter.ts
      promptBuilder.ts
    content/
      classifier.ts
      extractor.ts
      adapters/
        linkedin.ts
        greenhouse.ts
        lever.ts
        workday.ts
        indeed.ts
      manualSelection.ts
      domUtils.ts
    sidepanel/
      App.tsx
      components/
        AnalyzePanel.tsx
        QueueStatus.tsx
        BudgetStatus.tsx
        Timeline.tsx
        TimelineStepCard.tsx
        OpportunityPreview.tsx
        FitSummary.tsx
        GeneratedAssets.tsx
        TrackerView.tsx
        SettingsView.tsx
    storage/
      idb.ts
      stores.ts
      chromeStorage.ts
    shared/
      types.ts
      schemas.ts
      constants.ts
      hashing.ts
      tokenEstimation.ts
      logger.ts
      timeouts.ts
    tests/
      unit/
      integration/
      fixtures/
  docs/
    ARCHITECTURE.md
```

### Recommended stack
- TypeScript
- React
- Vite (or equivalent extension-friendly bundler)
- Dexie.js (optional)
- Zod (optional)

---

## 27) Manifest V3 Requirements
Use:
- side panel
- background service worker
- `activeTab`
- `storage`
- `scripting`
- `sidePanel`
- `contextMenus`
- optional `commands`

### Permission principle
Use the smallest permission set possible.
Avoid broad host permissions when `activeTab` is enough.

---

## 28) Testing Strategy

### Unit tests
- classifier
- extractor normalization
- deterministic scoring
- budget manager decisions
- queue behavior
- prompt compression
- schema validation

### Integration tests
- full run with mock Gemini provider
- queued multi-run behavior
- backoff behavior after simulated 429
- save/reload tracker
- rerun from cached page

### Fixtures
- LinkedIn job page
- Greenhouse page
- Lever page
- generic careers page
- irrelevant article page
- listing page

### Manual QA scenarios
1. Analyze supported job page
2. Analyze unsupported but relevant page
3. Analyze irrelevant page
4. Run two analyses quickly and verify queueing
5. Simulate 429 and verify backoff UI
6. Save/reopen tracker records

---

## 29) Acceptance Criteria
The build is complete only if all below are satisfied:

1. User can analyze current page from side panel.
2. Page is classified before deep extraction.
3. Multiple Gemini calls are shown in the timeline when required.
4. Tool calls and tool results are visible.
5. Full run history is persisted locally.
6. Tracker survives browser restarts.
7. Content scripts are injected only on demand.
8. Browser idle performance remains unaffected.
9. Default architecture uses a queue and avoids burst Gemini traffic.
10. Default architecture uses conservative rate budgeting.
11. Free-tier-friendly model routing is implemented.
12. Hard cap on Gemini calls per run is enforced.
13. 429 handling and backoff are implemented.
14. Minimal mode fallback works.
15. Final output includes fit summary + recommendation + concise generated assets.

---

## 30) Non-Goals
Do not implement in first version:
- auto-submitting applications
- auto-sending emails/messages
- cloud sync/backend
- heavy multi-tab monitoring
- continuous crawling
- OCR-heavy resume pipeline
- dependence on paid Gemini-only features such as paid-tier context caching

---

## 31) Suggested Implementation Sequence

### Phase 1 — core shell
- MV3 scaffold
- side panel
- local storage
- settings panel

### Phase 2 — deterministic path
- classifier
- extractor
- profile summary storage
- tracker persistence

### Phase 3 — Gemini-safe infrastructure
- queue manager
- budget manager
- Gemini adapter
- prompt builder/compressor

### Phase 4 — agent flow
- state machine
- timeline UI
- minimal mode + normal mode

### Phase 5 — adapters and polish
- LinkedIn
- Greenhouse
- Lever
- Workday
- budget status UI
- tests

---

## 32) What the Coding Agent Must Build
1. Working MV3 extension
2. React side panel UI
3. Local-first storage
4. Queue manager
5. Gemini budget manager
6. Gemini adapter with mock mode
7. Deterministic tools
8. Rate-limit-aware agent loop
9. Tracker UI
10. Tests + fixtures
11. README/setup docs

---

## 33) Prompt to Give the Coding Agent
Copy the following prompt exactly:

```text
Build the Chrome extension defined in the attached Markdown specification file. Treat that specification as the source of truth.

Important context:
- This project will use the FREE Google Gemini Developer API / Google AI Studio path, not a paid tier.
- The architecture must be explicitly optimized to avoid Gemini free-tier rate-limit errors.
- The extension must remain light on browser performance and should not continuously scrape or run background-heavy logic.

Your task:
1. Read the full spec carefully and implement the project exactly as described.
2. Use Manifest V3, TypeScript, and a React side panel UI.
3. Build the queue manager, budget manager, state machine, Gemini adapter, tool registry, IndexedDB persistence, and timeline UI.
4. Implement deterministic classification/extraction/comparison first, and use Gemini only where necessary.
5. Enforce a conservative Gemini call budget and a hard cap on calls per run.
6. Implement normal mode and minimal mode.
7. Implement 429 handling, backoff with jitter, and queueing.
8. Implement settings for API key, model selection, and conservative budget configuration.
9. Support generic extraction plus site-specific adapters.
10. Satisfy the assignment requirement to show reasoning summaries, tool calls, tool results, and multiple LLM turns.
11. Do not add features outside the spec unless required to complete the architecture cleanly.

Execution rules:
- First generate a detailed implementation plan from the spec.
- Then create the full project structure and files.
- Keep code modular and well commented.
- Use explicit types/interfaces/schemas.
- Prefer robust deterministic logic over vague LLM behavior.
- If any detail is ambiguous, choose the option that is most local-first, performance-safe, and Gemini-free-tier-safe.

Output expectations:
- Return the full codebase
- Include setup instructions
- Include a short explanation of major design choices and tradeoffs
```

---

## 34) Final Summary
This extension must feel like a **real browser agent** while still being safe for the **free Gemini path**.

### Key characteristics
- on-demand only
- local-first
- low browser overhead
- queue-based execution
- explicit rate budgeting
- deterministic first, Gemini second
- hard cap on LLM calls per run
- minimal mode fallback
- transparent timeline
- resilient against 429s

If implemented according to this specification, the result should be strong both for demonstration and for evaluation under the assignment constraints.
