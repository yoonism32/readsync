/**
 * Characterizes MyList.tsx's Th/Row table subcomponents before extracting
 * them into components/MyListTable.tsx. They're presentational, take no
 * hooks of their own, and (aside from MyList.tsx) have no importers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Th, Row } from '../components/MyListTable.js';
import type { Novel } from '../types/index.js';

afterEach(cleanup);

const BASE_NOVEL: Novel = {
  novel_id: 'n1',
  title: 'Some Novel',
  primary_url: 'https://novelarrow.com/novel/some-novel',
  author: null,
  genre: null,
  status: 'reading',
  favorite: false,
  rating: 0,
  notes: null,
  latest_chapter_num: 100,
  latest_chapter_title: null,
  chapters_updated_at: null,
  site_latest_chapter_time: null,
  site_latest_chapter_time_raw: null,
  last_activity: null,
  started_at: null,
  completed_at: null,
  current_read_through: 1,
  read_history: [],
  latest_chapter: 90,
  latest_percent: 50,
  latest_url: 'https://novelarrow.com/chapter/some-novel/chapter-90',
  latest_device_id: null,
  latest_device_label: null,
  latest_read_at: null,
  devices_reading: [],
};

function renderRow(novel: Partial<Novel>, handlers?: {
  onSetStatus?: (id: string, s: Novel['status']) => void;
  onToggleFav?: (n: Novel) => void;
}) {
  const n = { ...BASE_NOVEL, ...novel };
  const onSetStatus = handlers?.onSetStatus ?? vi.fn();
  const onToggleFav = handlers?.onToggleFav ?? vi.fn();
  return render(
    <MemoryRouter>
      <table><tbody><Row novel={n} onSetStatus={onSetStatus} onToggleFav={onToggleFav} /></tbody></table>
    </MemoryRouter>,
  );
}

describe('Th', () => {
  it('shows an ascending arrow when active and asc', () => {
    render(<table><thead><tr><Th label="Title" sortable active asc onClick={() => {}} /></tr></thead></table>);
    expect(screen.getByRole('columnheader').textContent).toBe('Title ▲');
  });

  it('shows a descending arrow when active and not asc', () => {
    render(<table><thead><tr><Th label="Title" sortable active={true} asc={false} onClick={() => {}} /></tr></thead></table>);
    expect(screen.getByRole('columnheader').textContent).toBe('Title ▼');
  });

  it('shows no arrow when inactive', () => {
    render(<table><thead><tr><Th label="Title" sortable onClick={() => {}} /></tr></thead></table>);
    expect(screen.getByRole('columnheader').textContent).toBe('Title');
  });

  it('fires onClick only from the toggle button, not the header sort, when both are present', () => {
    const onSort = vi.fn();
    const onToggle = vi.fn();
    render(
      <table><thead><tr>
        <Th
          label="Progress" sortable active onClick={onSort}
          toggle={{ active: false, symbol: '#', title: 'switch', onClick: onToggle }}
        />
      </tr></thead></table>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSort).not.toHaveBeenCalled();
  });
});

describe('Row', () => {
  it('links "Continue Reading" to the resume URL derived from latest_url/latest_percent', () => {
    renderRow({});
    const link = screen.getByRole('link', { name: 'Continue Reading →' });
    expect(link.getAttribute('href')).toContain('some-novel');
  });

  it('falls back to primary_url when there is no latest_url', () => {
    renderRow({ latest_url: null, primary_url: 'https://novelarrow.com/novel/some-novel' });
    const link = screen.getByRole('link', { name: 'Continue Reading →' });
    expect(link.getAttribute('href')).toBe('https://novelarrow.com/novel/some-novel');
  });

  it('shows a dash instead of a continue link when neither URL is present', () => {
    renderRow({ latest_url: null, primary_url: null });
    expect(screen.queryByRole('link', { name: 'Continue Reading →' })).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('calls onToggleFav with the novel when the star is clicked', () => {
    const onToggleFav = vi.fn();
    renderRow({}, { onToggleFav });
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }));
    expect(onToggleFav).toHaveBeenCalledWith(expect.objectContaining({ novel_id: 'n1' }));
  });

  it('calls onSetStatus with the new status when the status select changes', () => {
    const onSetStatus = vi.fn();
    renderRow({}, { onSetStatus });
    fireEvent.change(screen.getByLabelText('Status of Some Novel'), { target: { value: 'completed' } });
    expect(onSetStatus).toHaveBeenCalledWith('n1', 'completed');
  });

  it('shows a re-read badge only when current_read_through is above 1', () => {
    renderRow({ current_read_through: 2 });
    expect(screen.getByText('2nd read')).toBeDefined();
  });

  it('omits the re-read badge on a first read-through', () => {
    renderRow({ current_read_through: 1 });
    expect(screen.queryByText(/\d+(st|nd|rd|th) read/)).toBeNull();
  });

  it('shows a "behind" badge counting chapters read behind the latest known chapter', () => {
    renderRow({ latest_chapter: 90, latest_chapter_num: 95 });
    expect(screen.getByText('+5')).toBeDefined();
  });
});
