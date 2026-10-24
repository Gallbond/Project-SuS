import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DictionaryDrawer } from '../components/DictionaryDrawer';
import { BookIcon, BookmarkIcon } from '../components/Icons';
import { Markdown, type WordHit } from '../components/Markdown';
import { ReaderSettings } from '../components/ReaderSettings';
import { ThemeToggle } from '../components/ThemeToggle';
import { WordCard } from '../components/WordCard';
import { api, type ReadingState, type TextDoc } from '../lib/api';
import { paginate, renderPage, type Page } from '../lib/markdown';
import { useSettings } from '../lib/settings';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<TextDoc | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageDraft, setPageDraft] = useState('1');
  const [reading, setReading] = useState<ReadingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<WordHit | null>(null);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [savedWords, setSavedWords] = useState<ReadonlySet<string>>(() => new Set<string>());
  const { settings } = useSettings();

  const mainRef = useRef<HTMLElement>(null);
  const initialTargetRef = useRef<number | null>(null);
  const appliedRef = useRef(false);

  // Текст и позиция чтения загружаются вместе: закладка важнее последней страницы.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setDoc(null);
    setError(null);
    setHit(null);
    setReading(null);
    setPageIndex(0);
    setPageDraft('1');
    setSavedWords(new Set<string>());
    appliedRef.current = false;
    initialTargetRef.current = null;

    Promise.all([api.getText(id), api.getReading(id)])
      .then(([text, state]) => {
        if (!alive) return;
        const bookmarks = state.bookmarks ?? [];
        const target = bookmarks.length
          ? Math.max(...bookmarks.map((item) => item.page))
          : (state.page ?? 1);
        initialTargetRef.current = target;
        setDoc(text);
        setReading({ ...state });
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'Не удалось открыть текст');
      });

    return () => {
      alive = false;
    };
  }, [id]);

  // Страницы считаются один раз по эталону «шрифт 18, колонка 912, 27 строк».
  const pages = useMemo<Page[]>(() => (doc ? paginate(doc.body) : []), [doc]);

  useEffect(() => {
    if (!pages.length || appliedRef.current) return;
    const target = initialTargetRef.current ?? 1;
    setPageIndex(Math.min(Math.max(target - 1, 0), pages.length - 1));
    appliedRef.current = true;
  }, [pages]);

  // Прочитанной считаем страницу, на которой задержались: перетаскивание
  // слайдера не должно записывать в «прочитано» сотни страниц.
  useEffect(() => {
    if (!doc || pages.length === 0) return;
    const page = pageIndex + 1;
    const timer = setTimeout(() => {
      setReading((current) => {
        if (!current) return current;
        const alreadyRead = current.readPages.includes(page);
        if (alreadyRead && current.page === page && current.pages === pages.length) return current;
        return {
          ...current,
          page,
          pages: pages.length,
          readPages: alreadyRead ? current.readPages : [...current.readPages, page],
        };
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [doc, pages.length, pageIndex]);

  // Сохраняем позицию с задержкой.
  useEffect(() => {
    if (!doc || !reading || reading.pages === 0) return;
    const timer = setTimeout(() => {
      api
        .saveReading(doc.id, {
          page: reading.page,
          pages: reading.pages,
          readPages: reading.readPages,
          bookmarks: reading.bookmarks,
        })
        .catch(() => {
          // Позиция не сохранилась — не критично.
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [doc, reading]);

  const loadSavedWords = useCallback((lang: string) => {
    api
      .dictionary()
      .then((words) => {
        setSavedWords(
          new Set(
            words
              .filter((item) => item.lang === lang && item.highlight !== false)
              .map((item) => item.word.toLowerCase()),
          ),
        );
      })
      .catch(() => {
        // Подсветка — не критичная функция.
      });
  }, []);

  useEffect(() => {
    if (doc) loadSavedWords(doc.language);
  }, [doc, loadSavedWords]);

  const handleSavedChange = useCallback((word: string, saved: boolean) => {
    setSavedWords((current) => {
      const next = new Set(current);
      if (saved) next.add(word.toLowerCase());
      else next.delete(word.toLowerCase());
      return next;
    });
  }, []);

  const handleWordClick = useCallback((next: WordHit) => {
    setHit((current) => {
      const same =
        current?.range.startContainer === next.range.startContainer &&
        current?.range.startOffset === next.range.startOffset;
      return same ? null : next;
    });
  }, []);

  useEffect(() => {
    document.title = doc ? `${doc.title} — Project Sus` : 'Project Sus';
  }, [doc]);

  const html = useMemo(() => (pages[pageIndex] ? renderPage(pages[pageIndex]) : ''), [pages, pageIndex]);

  const goToPage = useCallback(
    (next: number) => {
      setPageIndex((current) => {
        const bounded = Math.min(Math.max(next, 0), Math.max(pages.length - 1, 0));
        return bounded === current ? current : bounded;
      });
      setHit(null);
      mainRef.current?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    },
    [pages.length],
  );

  useEffect(() => {
    setPageDraft(String(pageIndex + 1));
  }, [pageIndex]);

  const commitPage = () => {
    const parsed = Number.parseInt(pageDraft, 10);
    if (!Number.isFinite(parsed)) {
      setPageDraft(String(pageIndex + 1));
      return;
    }
    const target = Math.min(Math.max(parsed, 1), pages.length);
    setPageDraft(String(target));
    goToPage(target - 1);
  };

  const bookmarks = reading?.bookmarks ?? [];
  const bookmarked = bookmarks.some((item) => item.page === pageIndex + 1);

  // Прогресс считается от номера открытой страницы: вернулся назад — процент меньше.
  const percent = pages.length ? ((pageIndex + 1) / pages.length) * 100 : 0;
  const percentLabel = percent < 10 ? percent.toFixed(1).replace('.', ',') : String(Math.round(percent));

  const position = pages.length > 1 ? (pageIndex / (pages.length - 1)) * 100 : 0;
  const bookmarkPositions = bookmarks.map((item) => ({
    page: item.page,
    fraction: pages.length > 1 ? (item.page - 1) / (pages.length - 1) : 0,
  }));

  const toggleBookmark = () => {
    if (!reading) return;
    const page = pageIndex + 1;
    const next = bookmarked
      ? bookmarks.filter((item) => item.page !== page)
      : [...bookmarks, { page, createdAt: new Date().toISOString() }];
    setReading({ ...reading, bookmarks: next });
  };

  if (error) {
    return (
      <div className="state">
        <p>{error}</p>
        <Link className="btn" to="/">
          На главную
        </Link>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="state">
        <p>Загружаю текст…</p>
      </div>
    );
  }

  const ready = pages.length > 0;

  return (
    <div className="reader">
      <header className="reader__bar">
        <Link to="/" className="btn btn--ghost reader__back">
          ← Назад
        </Link>
        <h1 className="reader__title" title={doc.title}>
          {doc.title}
        </h1>
        <div className="reader__tools">
          <ThemeToggle />
          <ReaderSettings />
        </div>
      </header>

      <main className="reader__main" ref={mainRef}>
        <article className="reader__article" style={{ fontSize: `${settings.fontSize}px` }}>
          {ready ? (
            <Markdown
              html={html}
              lang={doc.language}
              savedWords={savedWords}
              onWordClick={handleWordClick}
            />
          ) : (
            <p className="reader__hint">Загружаю текст…</p>
          )}
        </article>
        <p className="reader__hint">Клик по слову — перевод и произношение</p>
      </main>

      <WordCard
        hit={hit}
        lang={doc.language}
        text={{ id: doc.id, title: doc.title }}
        onSavedChange={handleSavedChange}
        onClose={() => setHit(null)}
      />

      {ready && pages.length > 1 ? (
        <footer className="pager">
          {pages.length > 1 ? (
            <div className="pager__slider">
            <input
              type="range"
              className="pager__range"
              min={1}
              max={pages.length}
              value={pageIndex + 1}
              onChange={(event) => goToPage(Number(event.target.value) - 1)}
              style={{
                background: `linear-gradient(to right, var(--accent) ${position}%, var(--border-strong) ${position}%)`,
              }}
              aria-label="Перейти к странице"
            />
            {bookmarkPositions.map((mark) => (
              <button
                key={mark.page}
                type="button"
                className="pager__marker"
                style={{ left: `calc(8px + ${mark.fraction} * (100% - 16px))` }}
                title={`Закладка: страница ${mark.page}. Нажмите, чтобы перейти`}
                aria-label={`Перейти к закладке на странице ${mark.page}`}
                onClick={() => goToPage(mark.page - 1)}
              >
                <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
                  <path d="M8 19V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M9 2h6l-2 3 2 3H9z" fill="currentColor" />
                </svg>
              </button>
            ))}
            </div>
          ) : null}

          <div className="pager__row">
            <div className="pager__stats">
              <span>Прочитано {percentLabel}%</span>
            </div>

            <div className="pager__nav">
              <button
                type="button"
                className="icon-btn pager__arrow"
                onClick={() => goToPage(pageIndex - 1)}
                disabled={pageIndex === 0}
                aria-label="Предыдущая страница"
              >
                ‹
              </button>
              <input
                className="pager__input"
                type="number"
                inputMode="numeric"
                min={1}
                max={pages.length}
                value={pageDraft}
                onChange={(event) => setPageDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitPage();
                  }
                }}
                onBlur={commitPage}
                aria-label="Номер страницы"
              />
              <span className="pager__total">/ {pages.length}</span>
              <button
                type="button"
                className="icon-btn pager__arrow"
                onClick={() => goToPage(pageIndex + 1)}
                disabled={pageIndex >= pages.length - 1}
                aria-label="Следующая страница"
              >
                ›
              </button>
            </div>

            {pages.length > 2 ? (
              <button
                type="button"
                className={`btn btn--small pager__bookmark${bookmarked ? ' is-active' : ''}`}
                onClick={toggleBookmark}
                title={
                  bookmarked
                    ? 'Снять закладку — текст откроется на последней прочитанной странице'
                    : 'Текст будет открываться на этой странице'
                }
              >
                <BookmarkIcon filled={bookmarked} />
                <span className="pager__bookmark-text">{bookmarked ? 'На закладке' : 'В закладки'}</span>
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}

      {pages.length > 1 ? (
        <>
          <button
            type="button"
            className="page-zone page-zone--left"
            onClick={() => goToPage(pageIndex - 1)}
            disabled={pageIndex === 0}
            aria-label="Предыдущая страница"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="page-zone page-zone--right"
            onClick={() => goToPage(pageIndex + 1)}
            disabled={pageIndex >= pages.length - 1}
            aria-label="Следующая страница"
          >
            <span aria-hidden="true">›</span>
          </button>
        </>
      ) : null}

      <button
        type="button"
        className={`fab${pages.length > 1 ? ' fab--raised' : ''}`}
        onClick={() => setDictionaryOpen(true)}
        aria-label="Открыть словарь"
        title="Словарь"
      >
        <BookIcon />
      </button>

      <DictionaryDrawer
        open={dictionaryOpen}
        onClose={() => {
          setDictionaryOpen(false);
          loadSavedWords(doc.language);
        }}
      />
    </div>
  );
}
