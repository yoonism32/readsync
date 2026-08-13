import { useState } from 'react';
import useSWR from 'swr';
import { notes as notesApi, formatTimestamp } from '../api/client.js';
import { Spinner } from './Spinner.js';
import { useNow } from '../hooks/useNow.js';
import type { Note } from '../types/index.js';

interface NotesPanelProps {
  novelId: string;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  fontSize: 'var(--text-sm)',
  padding: '8px 10px',
  fontFamily: 'inherit',
};

function ChapterPill({ chapter }: { chapter: number }) {
  return (
    <span
      style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-accent)',
        background: 'var(--color-accent-glow)',
        border: '1px solid var(--color-accent-border)',
        borderRadius: 'var(--radius-full)',
        padding: '1px 8px',
        flexShrink: 0,
      }}
    >
      Ch. {chapter}
    </span>
  );
}

function NoteRow({ note, onChanged }: { note: Note; onChanged: () => void }) {
  useNow(); // ticks so the "Xm ago" label below advances without a data refetch
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note_text);
  const [chapter, setChapter] = useState(note.chapter_num?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await notesApi.update(note.id, text.trim(), chapter ? Number(chapter) : undefined);
      setEditing(false);
      onChanged();
    } catch {
      setError('Failed to save note');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await notesApi.delete(note.id);
      onChanged();
    } catch {
      setError('Failed to delete note');
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            placeholder="Ch."
            value={chapter}
            onChange={e => setChapter(e.target.value)}
            style={{ ...inputStyle, width: 72 }}
          />
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setText(note.note_text); }} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-accent" onClick={save} disabled={busy || !text.trim()}>
            Save
          </button>
        </div>
        {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {note.chapter_num != null && <ChapterPill chapter={note.chapter_num} />}
        <p style={{ flex: 1, fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'break-word' }}>
          {note.note_text}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <span className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>
          {formatTimestamp(note.updated_at)}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-xs)' }} onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>
        <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-xs)' }} onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>
      {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
    </div>
  );
}

export function NotesPanel({ novelId }: NotesPanelProps) {
  const { data, isLoading, mutate } = useSWR<Note[]>(
    `notes-${novelId}`,
    () => notesApi.forNovel(novelId),
    { revalidateOnFocus: false },
  );
  const [text, setText] = useState('');
  const [chapter, setChapter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await notesApi.create(novelId, text.trim(), chapter ? Number(chapter) : undefined);
      setText('');
      setChapter('');
      await mutate();
    } catch {
      setError('Failed to add note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 20, marginTop: 16 }}>
      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 12 }}>
        Notes
        {data && data.length > 0 && (
          <span className="text-muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 400, marginLeft: 8 }}>
            {data.length}
          </span>
        )}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note — theories, where you left off, things to remember…"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            placeholder="Ch. (optional)"
            value={chapter}
            onChange={e => setChapter(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
          />
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-accent" onClick={add} disabled={busy || !text.trim()}>
            Add note
          </button>
        </div>
        {error && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner /></div>
      ) : (data ?? []).length === 0 ? (
        <p className="text-faint" style={{ fontSize: 'var(--text-sm)' }}>No notes yet.</p>
      ) : (
        <div>
          {(data ?? []).map(n => (
            <NoteRow key={n.id} note={n} onChanged={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}
