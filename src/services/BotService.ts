import type { BotStatus } from '../types/index.js';

/** Singleton bot status — replaces global.botStatus anti-pattern. */
let status: BotStatus = {
  running: false,
  lastRun: null,
  lastRunSuccess: false,
  novelsUpdated: 0,
  novelsChecked: 0,
  nextRun: null,
  errors: [],
  cycleStartTime: null,
  cycleDuration: null,
};

export function getBotStatus(): BotStatus {
  return { ...status };
}

export function setBotStatus(patch: Partial<BotStatus>): void {
  status = { ...status, ...patch };
}
