import { MAX_ERRORS, RETAIN_ERRORS } from '../config.js';
import type { BotStatus, LogEntry } from '../types/index.js';

class BotStatusManager {
  private _status: BotStatus = {
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

  get status(): BotStatus {
    return this._status;
  }

  patch(updates: Partial<BotStatus>): void {
    this._status = { ...this._status, ...updates };
  }

  log(
    level: 'info' | 'warn' | 'error' | 'success',
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = { timestamp, level, message, ...context };

    const prefixes: Record<string, string> = {
      info: '[INFO]',
      warn: '[WARN]',
      error: '[ERROR]',
      success: '[SUCCESS]',
    };
    const prefix = prefixes[level] ?? '[LOG]';

    console.log(
      `${prefix} [${timestamp}] ${message}`,
      Object.keys(context).length > 0 ? context : '',
    );

    if (level === 'error' || level === 'warn') {
      this.addError(entry);
    }
  }

  addError(error: LogEntry): void {
    this._status.errors.push({ ...error, timestamp: new Date().toISOString() });
    if (this._status.errors.length > MAX_ERRORS) {
      this._status.errors = this._status.errors.slice(-RETAIN_ERRORS);
    }
  }
}

export const botService = new BotStatusManager();
