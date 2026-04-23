/**
 * Lightweight logger that tags log lines with a scope.
 * Levels can be tuned at runtime by setting `self.__oaLogLevel`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  // Allow runtime override; default "info".
  const g = globalThis as unknown as { __oaLogLevel?: LogLevel };
  return g.__oaLogLevel ?? "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => {
      if (shouldLog("debug")) console.debug(`[oa:${scope}]`, ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog("info")) console.info(`[oa:${scope}]`, ...args);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog("warn")) console.warn(`[oa:${scope}]`, ...args);
    },
    error: (...args: unknown[]) => {
      if (shouldLog("error")) console.error(`[oa:${scope}]`, ...args);
    },
  };
}
