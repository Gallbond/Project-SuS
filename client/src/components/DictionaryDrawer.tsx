import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type SavedWord } from '../lib/api';
import { useSettings } from '../lib/settings';
import { speak } from '../lib/tts';

interface DictionaryDrawerProps {
  open: boolean;
  onClose: () => void;
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
              <li className="dict-item" key={entry.id}>
                <div className="dict-item__main">
                  <div className="dict-item__head">
                    <span className="dict-item__word">{entry.word}</span>
                    {entry.ipa ? <span className="dict-item__ipa">[{entry.ipa}]</span> : null}
                  </div>
                  <p className="dict-item__translation">{entry.translation}</p>
                  <p className="dict-item__meta">
                    {entry.textTitle ?? 'без текста'} ·{' '}
                    {new Date(entry.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <div className="dict-item__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Произнести"
                    aria-label={`Произнести ${entry.word}`}
                    onClick={() => speak(entry.word, settings.rate, entry.lang)}
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Удалить из словаря"
                    aria-label={`Удалить ${entry.word}`}
                    onClick={() => void remove(entry)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>,
    document.body,
  );
}
