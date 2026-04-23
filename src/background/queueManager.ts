/**
 * Run Queue
 *
 * One active run at a time. Additional runs are queued with status "queued"
 * so the UI can show order/progress.
 */

import { createLogger } from "@/shared/logger";

const log = createLogger("queue");

export interface QueueItem {
  runId: string;
  tabId: number;
  url: string;
  enqueuedAt: number;
  forceMinimal?: boolean;
  cancelled?: boolean;
}

type Handler = (item: QueueItem) => Promise<void>;

export class RunQueue {
  private queue: QueueItem[] = [];
  private active: QueueItem | null = null;
  private running = false;
  private handler: Handler | null = null;
  private onChange: (() => void) | null = null;

  setHandler(h: Handler) {
    this.handler = h;
  }

  setOnChange(cb: () => void) {
    this.onChange = cb;
  }

  /** Add a new run; returns `queued=true` if another run is already active. */
  enqueue(item: QueueItem): { queued: boolean } {
    this.queue.push(item);
    this.notify();
    const queued = this.running;
    // Kick off processing; it's a no-op if already running.
    void this.process();
    return { queued };
  }

  cancel(runId: string): boolean {
    const idx = this.queue.findIndex((q) => q.runId === runId);
    if (idx >= 0) {
      this.queue[idx].cancelled = true;
      this.queue.splice(idx, 1);
      this.notify();
      return true;
    }
    if (this.active?.runId === runId) {
      this.active.cancelled = true;
      this.notify();
      return true;
    }
    return false;
  }

  getQueueSnapshot(): QueueItem[] {
    // Active first, then queued in order.
    return [
      ...(this.active ? [this.active] : []),
      ...this.queue.map((q) => ({ ...q })),
    ];
  }

  getActive(): QueueItem | null {
    return this.active;
  }

  size(): number {
    return this.queue.length + (this.active ? 1 : 0);
  }

  private notify() {
    try {
      this.onChange?.();
    } catch (e) {
      log.warn("queue onChange threw", e);
    }
  }

  private async process() {
    if (this.running || !this.handler) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        if (item.cancelled) continue;
        this.active = item;
        this.notify();
        try {
          await this.handler(item);
        } catch (err) {
          log.error("handler failed for run", item.runId, err);
        } finally {
          this.active = null;
          this.notify();
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export const runQueue = new RunQueue();
