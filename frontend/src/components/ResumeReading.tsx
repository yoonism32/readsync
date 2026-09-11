import { useState } from 'react';
import { coverUrl, formatTimestamp, resumeUrl } from '../api/client.js';
import { ArrowRightIcon } from './Icon.js';
import { ProgressBar } from './ProgressBar.js';
import type { Novel } from '../types/index.js';

export function ResumeReading({ novel }: { novel: Novel }) {
  const [failed, setFailed] = useState(false);
  if (!novel.latest_url) return null;
  return (
    <a className="resume-reading" href={resumeUrl(novel.latest_url, novel.latest_percent)} target="_blank" rel="noopener noreferrer">
      <div className="resume-book" aria-hidden="true">
        <div className="resume-book-pages" />
        <div className="resume-book-cover">
          {!failed ? <img src={coverUrl(novel.novel_id)} alt="" onError={() => setFailed(true)} /> : <span className="resume-book-title">{novel.title}</span>}
          <span className="resume-book-spine" />
        </div>
      </div>
      <div className="resume-copy">
        <h2>{novel.title}</h2>
        {novel.author && <p className="resume-author">{novel.author}</p>}
        <p className="resume-location">Chapter {novel.latest_chapter ?? '?'} <span>· {Math.round(novel.latest_percent ?? 0)}% through this chapter</span></p>
        <ProgressBar percent={novel.latest_percent ?? 0} size="md" />
        <p className="resume-last-read">{novel.latest_read_at ? `Last read ${formatTimestamp(novel.latest_read_at)}` : 'Your latest reading position'}{novel.latest_device_label && ` on ${novel.latest_device_label}`}</p>
        <span className="resume-action">Continue reading <ArrowRightIcon size={20} /></span>
      </div>
      <span className="resume-bookmark" aria-hidden="true" />
    </a>
  );
}
