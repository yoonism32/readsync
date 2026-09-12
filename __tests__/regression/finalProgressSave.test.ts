/**
 * Regression for the 2026-09-12 false progress snapshot on
 * `everyones-class-one-effort-10000x-bonus-reward`.
 *
 * Unload handlers run on main novel pages as well as reader pages. Before the
 * guard in sendFinal(), a loose URL fallback extracted `10000` from that slug
 * and sent it as a legitimate chapter-progress beacon.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beaconProgress: vi.fn(() => true),
}));

vi.mock('../../userscript/src/api/client.js', () => ({
  beaconProgress: mocks.beaconProgress,
  compareProgress: vi.fn(),
  postProgress: vi.fn(),
  postReread: vi.fn(),
}));

import { sendFinal } from '../../userscript/src/services/ProgressSync.js';

const globalRef = globalThis as unknown as { location?: Location };
const originalLocation = globalRef.location;

afterEach(() => {
  globalRef.location = originalLocation;
  mocks.beaconProgress.mockClear();
});

describe('sendFinal — main novel pages', () => {
  it('does not send an unload snapshot for a number in a novel slug', () => {
    globalRef.location = {
      pathname: '/novel/everyones-class-one-effort-10000x-bonus-reward',
    } as Location;

    sendFinal(0, {
      deviceId: 'chrome-test',
      deviceLabel: 'Chrome',
      pageLoadTime: Date.now() - 4_000,
      getScrollEl: () => document.body,
      getPercent: () => 0,
      updateBadgeStatus: () => undefined,
      showSyncBanner: () => undefined,
    });

    expect(mocks.beaconProgress).not.toHaveBeenCalled();
  });
});
