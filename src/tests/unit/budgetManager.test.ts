/**
 * Unit tests for GeminiBudgetManager decisions.
 * We stub the storage module so tests don't need IndexedDB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/storage/stores", () => ({
  addBudgetEvent: vi.fn(async () => {}),
}));

import { GeminiBudgetManager } from "@/background/budgetManager";

describe("GeminiBudgetManager", () => {
  let bm: GeminiBudgetManager;
  beforeEach(() => {
    bm = new GeminiBudgetManager();
    bm.setConfig({
      rpm: 10,
      tpm: 10_000,
      rpd: 100,
      safetyReservePct: 0,
      maxCallsPerRun: 3,
      autoMinimalMode: true,
    });
  });

  it("allows the first call", async () => {
    const d = await bm.shouldAllowCall(100);
    expect(d.kind).toBe("allow");
  });

  it("delays when a call is already in flight", async () => {
    bm.onRequestStart(100);
    const d = await bm.shouldAllowCall(100);
    expect(d.kind).toBe("delay");
  });

  it("rejects when daily budget is reached", async () => {
    // simulate 100 requests spread within a day
    for (let i = 0; i < 100; i += 1) bm.onRequestStart(10);
    for (let i = 0; i < 100; i += 1) bm.onRequestEnd();
    const d = await bm.shouldAllowCall(10);
    expect(d.kind).toBe("reject");
  });

  it("downgrades to minimal mode past 70% usage", async () => {
    // push usage above ~70% with 8 samples in the last minute
    for (let i = 0; i < 8; i += 1) bm.onRequestStart(10);
    for (let i = 0; i < 8; i += 1) bm.onRequestEnd();
    const d = await bm.shouldAllowCall(10);
    expect(d.kind === "downgrade" || d.kind === "allow").toBe(true);
    // at 8/10 it should hit the 70% threshold and downgrade
    expect(bm.getMode()).toBe("minimal");
  });

  it("backs off after onRateLimit", async () => {
    await bm.onRateLimit(0);
    const d = await bm.shouldAllowCall(10);
    expect(d.kind).toBe("delay");
  });

  it("snapshot exposes consistent percentages", () => {
    bm.onRequestStart(1000);
    bm.onRequestEnd();
    const snap = bm.snapshot();
    expect(snap.rpmUsedPct).toBeGreaterThan(0);
    expect(snap.rpmUsedPct).toBeLessThanOrEqual(100);
  });
});
