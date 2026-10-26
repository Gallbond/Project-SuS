import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type TextMeta } from '../lib/api';
import { fileToCoverDataUrl } from '../lib/image';
import { useSettings } from '../lib/settings';
import { AddTextDialog } from '../components/AddTextDialog';
import { Dialog } from '../components/Dialog';
import { DictionaryDrawer } from '../components/DictionaryDrawer';
import { HomeViewSettings } from '../components/HomeViewSettings';
import { StarIcon } from '../components/Icons';
import { ThemeToggle } from '../components/ThemeToggle';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pluralWords(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'слова';
  return 'слов';
}

function pluralTexts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'текст';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'текста';
  return 'текстов';
}

export function HomePage() {
  const navigate = useNavigate();
  const [texts, setTexts] = useState<TextMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'date' | 'title'>('date');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<TextMeta | null>(null);
  const [deleting, setDeleting] = useState<TextMeta | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [coverTarget, setCoverTarget] = useState<TextMeta | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** Сколько колонок реально влезает; 0 — авто по ширине окна. */
  const [columns, setColumns] = useState(0);
  const { settings } = useSettings();

  // Выбранное «плиток в ряд» — верхняя граница: если окно уже, колонок станет
  // меньше, чтобы карточки не сжимались в кашу.
  useEffect(() => {
    if (!settings.tilesPerRow) {
      setColumns(0);
      return;
    }

    const element = gridRef.current;
    if (!element) return;

    const update = () => {
      const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
      // Обложка + отступы + минимум места под текст.
      const minCard = 182 * settings.tilesScale + 100;
      const fit = Math.max(1, Math.floor((element.clientWidth + gap) / (minCard + gap)));
      setColumns(Math.min(settings.tilesPerRow, fit));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [settings.tilesPerRow, settings.tilesScale]);

  // Новую обложку можно поставить только из меню «⋯» на карточке.
  const pickCover = (text: TextMeta) => {
    setCoverTarget(text);
    coverInputRef.current?.click();
  };

  const handleCoverFile = async (file: File) => {
    const target = coverTarget;
    setCoverTarget(null);
    if (!target) return;
    try {
      const dataUrl = await fileToCoverDataUrl(file);
      await api.uploadCover(target.id, dataUrl);
      load();
    } catch {
      // Не удалось — просто не меняем обложку.
    }
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const load = useCallback(() => {
    setError(null);
    api
      .listTexts()
      .then(setTexts)
      .catch((cause: unknown) => {
        setTexts([]);
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить тексты');
      });
  }, []);

  useEffect(() => {
    load();
    document.title = 'Project Sus';
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (texts ?? []).filter((text) => text.title.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      // Избранные всегда сверху, дальше — выбранная сортировка.
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return sort === 'title'
        ? a.title.localeCompare(b.title, 'ru')
        : b.createdAt.localeCompare(a.createdAt);
    });
  }, [texts, query, sort]);

  const openText = (id: string) => navigate(`/text/${encodeURIComponent(id)}`);

  const removeCover = async (text: TextMeta) => {
    try {
      await api.removeCover(text.id);
      load();
    } catch {
      // Обложка не удалилась — не критично.
    }
  };

  const toggleFavorite = async (text: TextMeta) => {
    try {
      await api.setFavorite(text.id, !text.favorite);
      load();
    } catch {
      // Не получилось — оставляем как было.
    }
  };

  // Закрываем меню карточки по клику в любом месте вне него.
  useEffect(() => {
    if (!menuId) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.card__menu')) return;
      setMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuId]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">S</span>
          <div>
            <h1 className="brand__name">Project Sus</h1>
            <p className="brand__tag">Чтение с переводом по клику</p>
          </div>
        </div>

        <div className="topbar__tools">
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию…"
            aria-label="Поиск по названию"
          />
          <ThemeToggle />
          <button type="button" className="btn btn--ghost" onClick={() => setDictionaryOpen(true)}>
            Словарь
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            + Добавить текст
          </button>
        </div>
      </header>

      <main className="page__main">
        <div className="toolbar">
          <span className="toolbar__count">
            {texts === null ? 'Загружаю…' : `${visible.length} ${pluralTexts(visible.length)}`}
          </span>
          <div className="toolbar__right">
            <div className="segmented">
              <button
                type="button"
                className={sort === 'date' ? 'is-active' : ''}
                onClick={() => setSort('date')}
              >
                Сначала новые
              </button>
              <button
                type="button"
                className={sort === 'title' ? 'is-active' : ''}
                onClick={() => setSort('title')}
              >
                А–Я
              </button>
            </div>
            <HomeViewSettings effectiveColumns={columns} />
          </div>
        </div>

        {error ? (
          <div className="state state--error">
            <p>{error}</p>
            <button type="button" className="btn" onClick={load}>
              Повторить
            </button>
          </div>
        ) : null}

        {!error && texts !== null && visible.length === 0 ? (
          <div className="state">
            {query ? (
              <>
                <p>По запросу «{query}» ничего нет</p>
                <button type="button" className="btn btn--ghost" onClick={() => setQuery('')}>
                  Сбросить поиск
                </button>
              </>
            ) : (
              <>
                <p className="state__title">Пока пусто</p>
                <p>Добавь первый текст — это обычный файл .md</p>
                <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
                  + Добавить текст
                </button>
              </>
            )}
          </div>
        ) : null}

        <div
          ref={gridRef}
          className="grid"
          style={
            {
              '--tile-scale': String(settings.tilesScale),
              gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
            } as CSSProperties
          }
        >
          {visible.map((text) => (
            <article className={`card${menuId === text.id ? ' card--menu-open' : ''}`} key={text.id}>
              <CardCover text={text} onOpen={setLightbox} />

              <button type="button" className="card__main" onClick={() => openText(text.id)}>
                <span className="badge">{text.language.toUpperCase()}</span>
                <h2 className="card__title">{text.title}</h2>
                <p className="card__excerpt">{text.excerpt || 'Пустой текст'}</p>
                <span className="card__meta">
                  {text.words} {pluralWords(text.words)} · {formatDate(text.createdAt)}
                </span>
              </button>

              <button
                type="button"
                className={`icon-btn card__fav${text.favorite ? ' is-active' : ''}`}
                onClick={() => void toggleFavorite(text)}
                aria-label={text.favorite ? 'Убрать из избранного' : 'В избранное'}
                title={text.favorite ? 'Убрать из избранного' : 'В избранное'}
              >
                <StarIcon filled={text.favorite} />
              </button>

              <div className="card__menu">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Действия с текстом"
                  onClick={() => setMenuId(menuId === text.id ? null : text.id)}
                >
                  ⋯
                </button>
                {menuId === text.id ? (
                  <div className="menu">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        setRenaming(text);
                      }}
                    >
                      Переименовать
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        pickCover(text);
                      }}
                    >
                      {text.cover ? 'Заменить обложку' : 'Добавить обложку'}
                    </button>
                    {text.cover ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuId(null);
                          void removeCover(text);
                        }}
                      >
                        Убрать обложку
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="menu__danger"
                      onClick={() => {
                        setMenuId(null);
                        setDeleting(text);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </main>

      {adding ? (
        <AddTextDialog
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            openText(id);
          }}
        />
      ) : null}

      {renaming ? (
        <RenameDialog
          text={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            load();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteDialog
          text={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            load();
          }}
        />
      ) : null}

      <DictionaryDrawer open={dictionaryOpen} onClose={() => setDictionaryOpen(false)} />

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleCoverFile(file);
        }}
      />

      {lightbox ? (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Обложка">
          <img src={lightbox} alt="" />
        </div>
      ) : null}
    </div>
  );
}

interface CoverUploadProps {
  text: TextMeta;
  onOpen: (cover: string) => void;
}

/** Обложка слева на карточке: картинка (открывается крупно) или «плюсик». */
function CardCover({ text, onOpen }: CoverUploadProps) {
  if (!text.cover) {
    return (
      <div className="card__cover card__cover--empty" aria-hidden="true">
        <span>?</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="card__cover"
      onClick={() => onOpen(text.cover as string)}
      aria-label="Открыть обложку"
      title="Открыть обложку"
    >
      <img src={text.cover} alt="" loading="lazy" />
    </button>
  );
}

interface RenameDialogProps {
  text: TextMeta;
  onClose: () => void;
  onDone: () => void;
}

function RenameDialog({ text, onClose, onDone }: RenameDialogProps) {
  const [title, setTitle] = useState(text.title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) {
      setError('Название не может быть пустым');
      return;
    }
    setSaving(true);
    try {
      await api.renameText(text.id, title.trim());
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось переименовать');
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Переименовать текст"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" form="rename-form" className="btn btn--primary" disabled={saving}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="rename-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>Название</span>
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        {error ? <p className="form__error">{error}</p> : null}
      </form>
    </Dialog>
  );
}

interface DeleteDialogProps {
  text: TextMeta;
  onClose: () => void;
  onDone: () => void;
}

function DeleteDialog({ text, onClose, onDone }: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteText(text.id);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Удалить текст?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()} disabled={busy}>
            {busy ? 'Удаляю…' : 'Удалить'}
          </button>
        </>
      }
    >
      <p>
        «{text.title}» будет удалён вместе с файлом из папки <code>texts/</code>. Это необратимо.
      </p>
      {error ? <p className="form__error">{error}</p> : null}
    </Dialog>
  );
}
