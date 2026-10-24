import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type LookupResult } from '../lib/api';
import { clearHighlight, setHighlight } from '../lib/highlights';
import { useSettings } from '../lib/settings';
import { speak, stopSpeaking, useVoices } from '../lib/tts';
import type { WordHit } from './Markdown';

type LookupState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; result: LookupResult };

interface WordCardProps {
  hit: WordHit | null;
  lang: string;
  /** Откуда слово — чтобы в словаре было видно источник. */
  text?: { id: string; title: string } | null;
  /** Сообщает читалке, что слово добавлено/убрано — чтобы обновить подсветку. */
  onSavedChange?: (word: string, saved: boolean) => void;
  onClose: () => void;
}

function sourceLabel(source: LookupResult['source']): string {
  switch (source) {
    case 'override':
      return 'мой перевод';
    case 'cache':
      return 'из кэша';
    default:
      return 'машинный перевод';
  }
}

export function WordCard({ hit, lang, text, onSavedChange, onClose }: WordCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LookupState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingWord, setSavingWord] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { settings } = useSettings();
  const voices = useVoices(lang);
  const canSpeak = voices.length > 0;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Подсветка активного слова (без изменения DOM — через Highlight API).
  useEffect(() => {
    if (!hit) return;
    setHighlight('sus-active', [hit.range]);
    return () => clearHighlight('sus-active');
  }, [hit]);

  useEffect(() => {
    if (!hit) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    setEditing(false);
    setSaveError(null);
    api
      .lookup(hit.word, lang, controller.signal)
      .then((result) => setState({ status: 'ok', result }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: cause instanceof Error ? cause.message : 'Не удалось получить перевод',
        });
      });
    return () => controller.abort();
  }, [hit, lang, attempt]);

  useLayoutEffect(() => {
    if (!hit || isMobile) return;

    const place = () => {
      const card = cardRef.current;
      if (!card) return;
      const rect = hit.range.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const margin = 10;
      const left = Math.max(
        margin,
        Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin),
      );
      let top = rect.top - height - margin;
      if (top < margin) top = Math.min(rect.bottom + margin, window.innerHeight - height - margin);
      setPosition({ top, left });
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [hit, isMobile, state.status, editing]);

  useEffect(() => {
    if (!hit) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target)) return;
      const anchor = hit.range.startContainer.parentElement;
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [hit, onClose]);

  if (!hit) return null;

  const save = async () => {
    const value = draft.trim();
    if (!value) return;
    try {
      const result = await api.saveOverride(hit.word, lang, value);
      setState({ status: 'ok', result });
      setEditing(false);
    } catch (cause) {
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Не удалось сохранить перевод',
      });
    }
  };

  const resetOverride = async () => {
    try {
      setState({ status: 'ok', result: await api.removeOverride(hit.word, lang) });
    } catch (cause) {
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Не удалось сбросить перевод',
      });
    }
  };

  const play = () => {
    stopSpeaking();
    speak(hit.word, settings.rate, lang);
  };

  const toggleSaved = async () => {
    if (state.status !== 'ok' || savingWord) return;
    const { result } = state;

    setSavingWord(true);
    setSaveError(null);
    try {
      if (result.saved) {
        await api.removeSavedWord(result.word, lang);
        setState({ status: 'ok', result: { ...result, saved: false } });
        onSavedChange?.(result.word, false);
      } else {
        await api.saveWord({
          word: result.word,
          lang,
          translation: result.translation,
          ipa: result.ipa,
          textId: text?.id ?? null,
          textTitle: text?.title ?? null,
        });
        setState({ status: 'ok', result: { ...result, saved: true } });
        onSavedChange?.(result.word, true);
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Не удалось сохранить слово');
    } finally {
      setSavingWord(false);
    }
  };

  return createPortal(
    <div
      ref={cardRef}
      className={`word-card${isMobile ? ' word-card--sheet' : ''}`}
      style={
        isMobile
          ? undefined
          : {
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? 'visible' : 'hidden',
            }
      }
      role="dialog"
      aria-label={`Перевод слова ${hit.word}`}
    >
      <header className="word-card__head">
        <div className="word-card__title">
          <span className="word-card__word">{hit.word}</span>
          {state.status === 'ok' && state.result.ipa ? (
            <span className="word-card__ipa">[{state.result.ipa}]</span>
          ) : null}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </header>

      {state.status === 'loading' ? <div className="skeleton" aria-label="Загружаю перевод" /> : null}

      {state.status === 'error' ? (
        <div className="word-card__error">
          <p>{state.message}</p>
          <div className="word-card__actions">
            <button type="button" className="btn btn--small" onClick={() => setAttempt((value) => value + 1)}>
              Повторить
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => {
                setDraft('');
                setEditing(true);
              }}
            >
              Ввести свой перевод
            </button>
          </div>
        </div>
      ) : null}

      {state.status === 'ok' && !editing ? (
        <>
          <p className="word-card__translation">{state.result.translation}</p>
          <p className="word-card__source">{sourceLabel(state.result.source)}</p>
          <div className="word-card__actions">
            <button
              type="button"
              className="btn btn--small"
              onClick={play}
              disabled={!canSpeak}
              title={canSpeak ? 'Произнести вслух' : 'В системе нет голоса для этого языка'}
            >
              ▶ Послушать
            </button>
            <button
              type="button"
              className={`btn btn--small${state.result.saved ? ' btn--ghost' : ''}`}
              onClick={() => void toggleSaved()}
              disabled={savingWord}
            >
              {state.result.saved ? '✓ В словаре' : '＋ В словарь'}
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => {
                setDraft(state.result.translation);
                setEditing(true);
              }}
            >
              Исправить
            </button>
            {state.result.source === 'override' ? (
              <button type="button" className="btn btn--small btn--ghost" onClick={() => void resetOverride()}>
                Сбросить
              </button>
            ) : null}
          </div>
          {!canSpeak ? (
            <p className="word-card__hint">
              Для языка «{lang}» в системе нет голоса — добавь его в настройках Windows.
            </p>
          ) : null}
          {saveError ? <p className="word-card__hint word-card__hint--error">{saveError}</p> : null}
        </>
      ) : null}

      {editing ? (
        <div className="word-card__edit">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
              if (event.key === 'Escape') {
                event.stopPropagation();
                setEditing(false);
              }
            }}
            placeholder="Свой перевод"
          />
          <div className="word-card__actions">
            <button type="button" className="btn btn--small btn--primary" onClick={() => void save()}>
              Сохранить
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
