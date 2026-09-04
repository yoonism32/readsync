import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HourDetail } from './Stats.js';
import type { HourNovel } from '../types/index.js';

function novel(over: Partial<HourNovel> = {}): HourNovel {
  return {
    novel_id: 'novelbin:a',
    title: 'Novel A',
    seconds: 3600,
    min_chapter: 18,
    max_chapter: 42,
    ...over,
  };
}

describe('HourDetail', () => {
  afterEach(cleanup);

  it('always leads with the hour and its total time', () => {
    render(<HourDetail hour={21} seconds={5400} sessions={3} novels={[novel()]} />);
    expect(screen.getByText('9pm')).toBeTruthy();
    expect(screen.getByText('1h 30m')).toBeTruthy();
    expect(screen.getByText('3 sessions')).toBeTruthy();
  });

  // The roadmap item's actual ask: a chapter range when one novel owns the
  // hour, novel names when it's shared.
  it('shows a chapter range when one novel dominates the hour', () => {
    render(<HourDetail hour={9} seconds={3600} sessions={1} novels={[novel()]} />);
    expect(screen.getByText('Novel A')).toBeTruthy();
    expect(screen.getByText('Ch. 18–42')).toBeTruthy();
  });

  it('collapses a single-chapter span to one number, not a range', () => {
    render(
      <HourDetail hour={9} seconds={3600} sessions={1}
        novels={[novel({ min_chapter: 7, max_chapter: 7 })]} />,
    );
    expect(screen.getByText('Ch. 7')).toBeTruthy();
  });

  it('lists every novel with its contribution when the hour is shared', () => {
    render(
      <HourDetail hour={13} seconds={3600} sessions={4}
        novels={[
          novel({ novel_id: 'a', title: 'Novel A', seconds: 1800 }),
          novel({ novel_id: 'b', title: 'Novel B', seconds: 1800 }),
        ]} />,
    );
    expect(screen.getByText('Novel A')).toBeTruthy();
    expect(screen.getByText('Novel B')).toBeTruthy();
    // Shared hour → no chapter range, which would misattribute the span to
    // whichever novel happened to sort first.
    expect(screen.queryByText(/^Ch\./)).toBeNull();
    expect(screen.getAllByText('30m')).toHaveLength(2);
  });

  it('omits the range when no chapter-numbered snapshot fell in the hour', () => {
    render(
      <HourDetail hour={9} seconds={3600} sessions={1}
        novels={[novel({ min_chapter: null, max_chapter: null })]} />,
    );
    expect(screen.getByText('Novel A')).toBeTruthy();
    expect(screen.queryByText(/^Ch\./)).toBeNull();
  });

  it('says so for an hour with no reading at all', () => {
    render(<HourDetail hour={4} seconds={0} sessions={0} novels={[]} />);
    expect(screen.getByText(/no reading in this hour/i)).toBeTruthy();
  });
});
