import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RatingStars } from './RatingStars.js';

afterEach(cleanup);

/** jsdom's getBoundingClientRect always returns a zero rect; stub a fixed
 *  20px-wide star so left/right-half hit-testing is deterministic. */
function stubStarWidth() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20,
    toJSON: () => {},
  });
}

describe('RatingStars — half-star click hit-testing', () => {
  it('reports a whole-star value when the right half of a star is clicked', () => {
    stubStarWidth();
    const onChange = vi.fn();
    render(<RatingStars value={0} onChange={onChange} />);

    const thirdStar = screen.getByRole('radio', { name: '3 stars' });
    fireEvent.click(thirdStar, { clientX: 15 }); // right half of a 20px star

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('reports a half-star value when the left half of a star is clicked', () => {
    stubStarWidth();
    const onChange = vi.fn();
    render(<RatingStars value={0} onChange={onChange} />);

    const thirdStar = screen.getByRole('radio', { name: '3 stars' });
    fireEvent.click(thirdStar, { clientX: 5 }); // left half of a 20px star

    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it('does not call onChange when readOnly', () => {
    stubStarWidth();
    const onChange = vi.fn();
    render(<RatingStars value={3} onChange={onChange} readOnly />);

    const thirdStar = screen.getByRole('button', { name: '3 stars' });
    fireEvent.click(thirdStar, { clientX: 15 });

    expect(onChange).not.toHaveBeenCalled();
  });
});
