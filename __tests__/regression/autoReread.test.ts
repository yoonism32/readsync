/**
 * Regression test for a false-positive auto-reread on a second device.
 *
 * Auto-reread detection compared a novel-wide max chapter (across every
 * device) against the chapter number in a single sync request. Read chapter
 * 500 on desktop, then open the same novel for the first time on a new
 * phone landing on chapter 10 — that one sync computed 500 - 10 >= 50 and
 * archived the still-ongoing read as "completed", starting a phantom
 * read-through #2, with no malicious input required: just the ordinary
 * multi-device flow the app exists to support.
 *
 * Fix: scope the max-chapter query to the device making the request, so
 * isAutoReread() only ever sees a genuine same-device drop.
 */
import { describe, expect, it } from 'vitest';
import { isAutoReread } from '../../src/routes/progress.js';

describe('isAutoReread', () => {
  it('detects a genuine same-device reread', () => {
    // This device previously reached chapter 500; it's now back at chapter 1.
    expect(isAutoReread(500, 1)).toBe(true);
  });

  it('is not fooled by a new device with no prior chapters on this novel', () => {
    // A brand-new device has no history for this novel — its own max is 0.
    expect(isAutoReread(0, 10)).toBe(false);
  });

  it('does not trigger on an ordinary forward read', () => {
    expect(isAutoReread(100, 105)).toBe(false);
  });

  it('does not trigger just under the threshold', () => {
    expect(isAutoReread(100, 51)).toBe(false);
  });

  it('triggers exactly at the threshold', () => {
    expect(isAutoReread(100, 50)).toBe(true);
  });
});
