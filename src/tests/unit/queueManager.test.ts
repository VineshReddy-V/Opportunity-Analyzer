/**
 * Unit tests for RunQueue.
 */

import { describe, expect, it, vi } from "vitest";
import { RunQueue } from "@/background/queueManager";

describe("RunQueue", () => {
  it("runs queued items serially and marks active/queued correctly", async () => {
    const q = new RunQueue();
    const calls: string[] = [];
    q.setHandler(async (item) => {
      calls.push(`start:${item.runId}`);
      await new Promise((r) => setTimeout(r, 10));
      calls.push(`end:${item.runId}`);
    });

    q.enqueue({ runId: "a", tabId: 1, url: "x", enqueuedAt: Date.now() });
    const r2 = q.enqueue({
      runId: "b",
      tabId: 1,
      url: "y",
      enqueuedAt: Date.now(),
    });
    // second enqueue should report queued=true
    expect(r2.queued).toBe(true);

    // wait for queue to drain
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
    ]);
  });

  it("cancel removes a pending item", async () => {
    const q = new RunQueue();
    q.setHandler(async (item) => {
      // Simulate work but respect cancellation signal via item.cancelled.
      if (item.cancelled) return;
      await new Promise((r) => setTimeout(r, 5));
    });
    q.enqueue({ runId: "a", tabId: 1, url: "x", enqueuedAt: Date.now() });
    q.enqueue({ runId: "b", tabId: 1, url: "y", enqueuedAt: Date.now() });
    expect(q.cancel("b")).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(q.size()).toBe(0);
  });

  it("notifies onChange", async () => {
    const q = new RunQueue();
    const spy = vi.fn();
    q.setOnChange(spy);
    q.setHandler(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    q.enqueue({ runId: "a", tabId: 1, url: "x", enqueuedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 20));
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });
});
