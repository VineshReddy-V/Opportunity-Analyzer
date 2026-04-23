/**
 * SettingsView — three tabs in one card: Gemini, Budget, Profile.
 */
import React, { useEffect, useState } from "react";
import { MSG } from "@/shared/messaging";
import type {
  CandidateProfileSummary,
  GeminiSettings,
  RateBudgetConfig,
} from "@/shared/types";
import { sendMessage } from "../hooks/useBackgroundBridge";
import {
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_RPD,
  DEFAULT_RPM,
  DEFAULT_SAFETY_RESERVE_PCT,
  DEFAULT_TPM,
  ABSOLUTE_MAX_CALLS_PER_RUN,
} from "@/shared/constants";

export function SettingsView() {
  const [tab, setTab] = useState<"gemini" | "budget" | "profile">("gemini");
  return (
    <div>
      <div className="card">
        <h2>Settings</h2>
        <div className="row">
          <button
            className={tab === "gemini" ? "active" : "ghost"}
            onClick={() => setTab("gemini")}
          >
            Gemini
          </button>
          <button
            className={tab === "budget" ? "active" : "ghost"}
            onClick={() => setTab("budget")}
          >
            Budget
          </button>
          <button
            className={tab === "profile" ? "active" : "ghost"}
            onClick={() => setTab("profile")}
          >
            Profile
          </button>
        </div>
      </div>
      {tab === "gemini" && <GeminiSettingsForm />}
      {tab === "budget" && <BudgetForm />}
      {tab === "profile" && <ProfileForm />}
    </div>
  );
}

// --- Gemini settings --------------------------------------------------------

function GeminiSettingsForm() {
  const [s, setS] = useState<GeminiSettings>({
    apiKey: "",
    primaryModel: DEFAULT_PRIMARY_MODEL,
    fallbackModel: DEFAULT_FALLBACK_MODEL,
    mockMode: false,
  });
  const [msg, setMsg] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const r = await sendMessage<
        { type: string },
        { ok: boolean; settings: GeminiSettings }
      >({ type: MSG.getSettings });
      if (r.ok) setS(r.settings);
    })();
  }, []);

  const save = async () => {
    setMsg(undefined);
    try {
      await sendMessage({ type: MSG.saveSettings, settings: s });
      setMsg("Saved");
      setTimeout(() => setMsg(undefined), 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card">
      <h3>Gemini API</h3>
      <label>
        API key (free Google AI Studio)
        <input
          type="password"
          value={s.apiKey}
          onChange={(e) => setS({ ...s, apiKey: e.target.value })}
          placeholder="AIza..."
        />
      </label>
      <div className="muted" style={{ marginTop: 4 }}>
        Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
        Stored only in chrome.storage.local on this device.
      </div>
      <div className="grid-2" style={{ marginTop: 8 }}>
        <div>
          <label>Primary model</label>
          <input
            value={s.primaryModel}
            onChange={(e) => setS({ ...s, primaryModel: e.target.value })}
          />
        </div>
        <div>
          <label>Fallback model</label>
          <input
            value={s.fallbackModel}
            onChange={(e) => setS({ ...s, fallbackModel: e.target.value })}
          />
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={s.mockMode}
          onChange={(e) => setS({ ...s, mockMode: e.target.checked })}
          style={{ width: "auto" }}
        />
        <span className="muted">Mock mode (no network calls; demo only)</span>
      </label>
      <div className="muted" style={{ marginTop: 8 }}>
        Free-tier note: prompts sent via free API may be processed differently
        than paid tier; avoid sharing sensitive PII.
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={save}>Save</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}

// --- Budget form ------------------------------------------------------------

function BudgetForm() {
  const [c, setC] = useState<RateBudgetConfig>({
    rpm: DEFAULT_RPM,
    tpm: DEFAULT_TPM,
    rpd: DEFAULT_RPD,
    safetyReservePct: DEFAULT_SAFETY_RESERVE_PCT,
    maxCallsPerRun: ABSOLUTE_MAX_CALLS_PER_RUN,
    autoMinimalMode: true,
  });
  const [msg, setMsg] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const r = await sendMessage<
        { type: string },
        { ok: boolean; config: RateBudgetConfig }
      >({ type: MSG.getBudgetConfig });
      if (r.ok) setC(r.config);
    })();
  }, []);

  const save = async () => {
    await sendMessage({ type: MSG.saveBudgetConfig, config: c });
    setMsg("Saved");
    setTimeout(() => setMsg(undefined), 1500);
  };

  return (
    <div className="card">
      <h3>Conservative rate budget</h3>
      <div className="muted" style={{ marginBottom: 6 }}>
        Defaults are conservative. Raise only if your Google AI Studio console
        clearly shows higher guaranteed limits.
      </div>
      <div className="grid-2">
        <div>
          <label>RPM</label>
          <input
            type="number"
            min={1}
            value={c.rpm}
            onChange={(e) => setC({ ...c, rpm: +e.target.value })}
          />
        </div>
        <div>
          <label>TPM</label>
          <input
            type="number"
            min={1000}
            value={c.tpm}
            onChange={(e) => setC({ ...c, tpm: +e.target.value })}
          />
        </div>
        <div>
          <label>RPD</label>
          <input
            type="number"
            min={1}
            value={c.rpd}
            onChange={(e) => setC({ ...c, rpd: +e.target.value })}
          />
        </div>
        <div>
          <label>Safety reserve %</label>
          <input
            type="number"
            min={0}
            max={90}
            value={c.safetyReservePct}
            onChange={(e) => setC({ ...c, safetyReservePct: +e.target.value })}
          />
        </div>
        <div>
          <label>Max LLM calls / run</label>
          <input
            type="number"
            min={1}
            max={ABSOLUTE_MAX_CALLS_PER_RUN}
            value={c.maxCallsPerRun}
            onChange={(e) =>
              setC({
                ...c,
                maxCallsPerRun: Math.min(
                  ABSOLUTE_MAX_CALLS_PER_RUN,
                  Math.max(1, +e.target.value),
                ),
              })
            }
          />
        </div>
        <div>
          <label>Auto minimal mode</label>
          <select
            value={c.autoMinimalMode ? "yes" : "no"}
            onChange={(e) =>
              setC({ ...c, autoMinimalMode: e.target.value === "yes" })
            }
          >
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={save}>Save</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}

// --- Profile form -----------------------------------------------------------

function ProfileForm() {
  const [p, setP] = useState<CandidateProfileSummary>({
    targetRoles: [],
    experienceYears: 0,
    topSkills: [],
    projectHighlights: [],
    preferredLocations: [],
    summary: "",
    redactedMode: true,
    updatedAt: Date.now(),
  });
  const [msg, setMsg] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const r = await sendMessage<
        { type: string },
        { ok: boolean; profile?: CandidateProfileSummary }
      >({ type: MSG.getProfile });
      if (r.ok && r.profile) setP(r.profile);
    })();
  }, []);

  const save = async () => {
    await sendMessage({ type: MSG.saveProfile, profile: p });
    setMsg("Saved");
    setTimeout(() => setMsg(undefined), 1500);
  };

  const joinLines = (arr: string[]) => arr.join("\n");
  const splitLines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

  return (
    <div className="card">
      <h3>Candidate profile summary</h3>
      <div className="muted" style={{ marginBottom: 6 }}>
        Stored locally. Only compact fields are sent to Gemini.
      </div>
      <div className="grid-2">
        <div>
          <label>Display name (optional; never sent to LLM)</label>
          <input
            value={p.displayName ?? ""}
            onChange={(e) => setP({ ...p, displayName: e.target.value })}
          />
        </div>
        <div>
          <label>Experience (years)</label>
          <input
            type="number"
            min={0}
            value={p.experienceYears}
            onChange={(e) => setP({ ...p, experienceYears: +e.target.value })}
          />
        </div>
      </div>
      <label style={{ marginTop: 8 }}>Target roles (one per line)</label>
      <textarea
        value={joinLines(p.targetRoles)}
        onChange={(e) => setP({ ...p, targetRoles: splitLines(e.target.value) })}
      />
      <label style={{ marginTop: 8 }}>Top skills (one per line)</label>
      <textarea
        value={joinLines(p.topSkills)}
        onChange={(e) => setP({ ...p, topSkills: splitLines(e.target.value) })}
      />
      <label style={{ marginTop: 8 }}>Project highlights (one per line)</label>
      <textarea
        value={joinLines(p.projectHighlights)}
        onChange={(e) =>
          setP({ ...p, projectHighlights: splitLines(e.target.value) })
        }
      />
      <label style={{ marginTop: 8 }}>Preferred locations (one per line)</label>
      <textarea
        value={joinLines(p.preferredLocations)}
        onChange={(e) =>
          setP({ ...p, preferredLocations: splitLines(e.target.value) })
        }
      />
      <label style={{ marginTop: 8 }}>Summary paragraph</label>
      <textarea
        value={p.summary}
        onChange={(e) => setP({ ...p, summary: e.target.value })}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={p.redactedMode}
          onChange={(e) => setP({ ...p, redactedMode: e.target.checked })}
          style={{ width: "auto" }}
        />
        <span className="muted">Redacted mode (shorter summary sent to Gemini)</span>
      </label>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={save}>Save</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}
