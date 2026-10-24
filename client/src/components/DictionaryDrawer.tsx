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
                <div className="dict-item__head">
                  <span className="dict-item__word">{entry.word}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--small"
                    title="Произнести"
                    aria-label={`Произнести ${entry.word}`}
                    onClick={() => speak(entry.word, settings.rate, entry.lang)}
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--small dict-item__delete"
                    title="Удалить из словаря"
                    aria-label={`Удалить ${entry.word}`}
                    onClick={() => void remove(entry)}
                  >
                    ✕
                  </button>
                </div>
                {entry.ipa ? <p className="dict-item__ipa">[{entry.ipa}]</p> : null}
                <p className="dict-item__translation">{entry.translation}</p>
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
                        onChange={() => void toggleHighlight(entry)}
                        aria-label={`Подсвечивать «${entry.word}» в текстах`}
                      />
                      <span className="switch__track" aria-hidden="true" />
                    </label>
                    <span className="dict-item__toggle-label">В тексте</span>
                  </div>
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
