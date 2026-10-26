import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type SavedWord } from '../lib/api';
import { useSettings } from '../lib/settings';
import { speak } from '../lib/tts';

interface DictionaryDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface DictItemProps {
  entry: SavedWord;
  rate: number;
  onRemove: (entry: SavedWord) => void;
  onToggleHighlight: (entry: SavedWord) => void;
  onNoteChange: (id: string, note: string) => void;
}

/** Карточка слова в словаре: перевод, подсветка и личная заметка. */
function DictItem({ entry, rate, onRemove, onToggleHighlight, onNoteChange }: DictItemProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(entry.note);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Свежий текст заметки подставляем при раскрытии поля.
  useEffect(() => {
    if (open) setDraft(entry.note);
  }, [open, entry.note]);

  const saveNote = async () => {
    const clean = draft.trim();
    if (clean === entry.note) return;
    try {
      const { note } = await api.saveNote(entry.word, entry.lang, clean);
      onNoteChange(entry.id, note);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <li className="dict-item">
      <div className="dict-item__head">
        <span className="dict-item__word">{entry.word}</span>
        <button
          type="button"
          className="icon-btn icon-btn--small"
          title="Произнести"
          aria-label={`Произнести ${entry.word}`}
          onClick={() => speak(entry.word, rate, entry.lang)}
        >
          ▶
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--small dict-item__delete"
          title="Удалить из словаря"
          aria-label={`Удалить ${entry.word}`}
          onClick={() => onRemove(entry)}
        >
          ✕
        </button>
      </div>

      {entry.ipa ? <p className="dict-item__ipa">[{entry.ipa}]</p> : null}
      <p className="dict-item__translation">{entry.translation}</p>

      {entry.note && !open ? <p className="dict-item__note">{entry.note}</p> : null}

      <button
        type="button"
        className={`dict-item__note-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? 'Свернуть заметку' : 'Личная заметка'}
      >
        <span>Заметка</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2 4.5 6 8.5l4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="dict-item__note-edit">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            placeholder="Личная заметка об этом слове…"
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus('idle');
            }}
            onBlur={() => void saveNote()}
          />
          <span className="dict-item__note-status">
            {status === 'saved' ? 'Сохранено' : status === 'error' ? 'Не сохранилось' : ''}
          </span>
        </div>
      ) : null}

      <div className="dict-item__footer">
        <p className="dict-item__meta">
          {entry.textTitle ?? 'без текста'} ·{' '}
          {new Date(entry.createdAt).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
          })}
        </p>

        <div className="dict-item__toggle">
          <label className="switch" title="Подсвечивать слово в текстах">
            <input
              type="checkbox"
              checked={entry.highlight}
              onChange={() => onToggleHighlight(entry)}
              aria-label={`Подсвечивать «${entry.word}» в текстах`}
            />
            <span className="switch__track" aria-hidden="true" />
          </label>
          <span className="dict-item__toggle-label">В тексте</span>
        </div>
      </div>
    </li>
  );
}

export function DictionaryDrawer({ open, onClose }: DictionaryDrawerProps) {
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setWords(null);
    setError(null);

    api
      .dictionary()
      .then((list) => {
        if (alive) setWords(list);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить словарь');
      });

    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const remove = async (entry: SavedWord) => {
    setWords((list) => list?.filter((item) => item.id !== entry.id) ?? null);
    try {
      await api.removeSavedWord(entry.word, entry.lang);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить слово');
    }
  };

  const toggleHighlight = async (entry: SavedWord) => {
    const next = !entry.highlight;
    setWords(
      (list) => list?.map((item) => (item.id === entry.id ? { ...item, highlight: next } : item)) ?? null,
    );
    try {
      await api.setWordHighlight(entry.word, entry.lang, next);
    } catch (cause) {
      setWords(
        (list) =>
          list?.map((item) => (item.id === entry.id ? { ...item, highlight: !next } : item)) ?? null,
      );
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить подсветку');
    }
  };

  const setNote = (id: string, note: string) => {
    setWords((list) => list?.map((item) => (item.id === id ? { ...item, note } : item)) ?? null);
  };

  return createPortal(
    <>
      <div className="drawer-backdrop" onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Словарь">
        <header className="drawer__head">
          <h2>Словарь</h2>
          {words ? <span className="drawer__count">{words.length}</span> : null}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="drawer__body">
          {error ? <p className="form__error">{error}</p> : null}
          {words === null && !error ? <p className="drawer__empty">Загружаю…</p> : null}
          {words && words.length === 0 ? (
            <p className="drawer__empty">
              Пока пусто.
              <br />
              Нажми «＋ В словарь» в карточке слова — оно появится здесь.
            </p>
          ) : null}

          <ul className="dict-list">
            {(words ?? []).map((entry) => (
              <DictItem
                key={entry.id}
                entry={entry}
                rate={settings.rate}
                onRemove={remove}
                onToggleHighlight={toggleHighlight}
                onNoteChange={setNote}
              />
            ))}
          </ul>
        </div>
      </aside>
    </>,
    document.body,
  );
}
