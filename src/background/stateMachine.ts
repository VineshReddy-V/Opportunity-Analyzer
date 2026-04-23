/**
 * Agent State Machine
 *
 * A simple typed state machine that constrains the legal transitions
 * inside an agent run. The orchestrator drives transitions; this file
 * only validates them and emits log lines the timeline can consume.
 */

import { createLogger } from "@/shared/logger";

const log = createLogger("fsm");

export type AgentState =
  | "IDLE"
  | "BOOTSTRAP"
  | "QUEUE_WAIT"
  | "CLASSIFY_PAGE"
  | "EXTRACT_PAGE"
  | "LOAD_PROFILE"
  | "COMPARE"
  | "PLAN_ANALYZE"
  | "GENERATE_ASSETS"
  | "SAVE_TRACKER"
  | "DONE"
  | "ERROR"
  | "NEEDS_USER_INPUT"
  | "CANCELLED"
  | "RATE_LIMIT_BACKOFF";

const TRANSITIONS: Record<AgentState, AgentState[]> = {
  IDLE: ["BOOTSTRAP", "QUEUE_WAIT", "CANCELLED"],
  BOOTSTRAP: ["CLASSIFY_PAGE", "ERROR", "CANCELLED"],
  QUEUE_WAIT: ["BOOTSTRAP", "CANCELLED"],
  CLASSIFY_PAGE: [
    "EXTRACT_PAGE",
    "DONE", // early stop for irrelevant pages
    "NEEDS_USER_INPUT",
    "ERROR",
    "CANCELLED",
  ],
  EXTRACT_PAGE: [
    "LOAD_PROFILE",
    "NEEDS_USER_INPUT",
    "ERROR",
    "CANCELLED",
  ],
  LOAD_PROFILE: ["COMPARE", "NEEDS_USER_INPUT", "ERROR", "CANCELLED"],
  COMPARE: ["PLAN_ANALYZE", "ERROR", "CANCELLED"],
  PLAN_ANALYZE: [
    "GENERATE_ASSETS",
    "SAVE_TRACKER", // minimal-mode shortcut
    "RATE_LIMIT_BACKOFF",
    "ERROR",
    "CANCELLED",
  ],
  GENERATE_ASSETS: [
    "SAVE_TRACKER",
    "RATE_LIMIT_BACKOFF",
    "ERROR",
    "CANCELLED",
  ],
  SAVE_TRACKER: ["DONE", "ERROR", "CANCELLED"],
  RATE_LIMIT_BACKOFF: [
    "PLAN_ANALYZE",
    "GENERATE_ASSETS",
    "SAVE_TRACKER",
    "ERROR",
    "CANCELLED",
  ],
  NEEDS_USER_INPUT: [
    "CLASSIFY_PAGE",
    "EXTRACT_PAGE",
    "LOAD_PROFILE",
    "SAVE_TRACKER",
    "DONE",
    "ERROR",
    "CANCELLED",
  ],
  DONE: [],
  ERROR: [],
  CANCELLED: [],
};

export interface StateMachineOptions {
  onTransition?: (from: AgentState, to: AgentState) => void;
}

export class StateMachine {
  private current: AgentState = "IDLE";
  private readonly opts: StateMachineOptions;

  constructor(opts: StateMachineOptions = {}) {
    this.opts = opts;
  }

  state(): AgentState {
    return this.current;
  }

  canGo(next: AgentState): boolean {
    return TRANSITIONS[this.current]?.includes(next) ?? false;
  }

  go(next: AgentState): void {
    if (!this.canGo(next)) {
      log.warn(`Illegal transition ${this.current} -> ${next}`);
      // We soft-fail rather than throw so a misbehaving path doesn't
      // crash the service worker. Instead we reroute through ERROR.
      const prev = this.current;
      this.current = "ERROR";
      this.opts.onTransition?.(prev, "ERROR");
      return;
    }
    const prev = this.current;
    this.current = next;
    this.opts.onTransition?.(prev, next);
  }
}
