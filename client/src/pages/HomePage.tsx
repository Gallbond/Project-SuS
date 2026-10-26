import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Folder, type TextMeta } from '../lib/api';
import { fileToCoverDataUrl } from '../lib/image';
import { SORT_MODES, useSettings } from '../lib/settings';
import { AddTextDialog } from '../components/AddTextDialog';
import { Dialog } from '../components/Dialog';
import { DictionaryDrawer } from '../components/DictionaryDrawer';
import { FolderDeck, MAX_FOLDER_TEXTS } from '../components/FolderDeck';
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

/** Убирает текст из всех папок: так «переезд» в другую папку остаётся простым. */
function withoutText(folders: Folder[], textId: string): Folder[] {
  return folders.map((folder) =>
    folder.textIds.includes(textId)
      ? { ...folder, textIds: folder.textIds.filter((id) => id !== textId) }
      : folder,
  );
}

type FolderDialogState =
  | { mode: 'create'; textId?: string }
  | { mode: 'rename'; folder: Folder };

export function HomePage() {
  const navigate = useNavigate();
  const [texts, setTexts] = useState<TextMeta[] | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<TextMeta | null>(null);
  const [deleting, setDeleting] = useState<TextMeta | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuStep, setMenuStep] = useState<'main' | 'folders'>('main');
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [coverTarget, setCoverTarget] = useState<TextMeta | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** Текст, который тащат из папки обратно в список. */
  const [folderDrag, setFolderDrag] = useState<string | null>(null);
  /** Текст, которого не взяла переполненная папка: короткая анимация возврата. */
  const [returnedId, setReturnedId] = useState<string | null>(null);
  const [rejectFolderId, setRejectFolderId] = useState<string | null>(null);
  const rejectTimer = useRef(0);
  /** Пасхалка: 67 кликов по логотипу. */
  const logoClicks = useRef(0);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** Сколько колонок реально влезает; 0 — авто по ширине окна. */
  const [columns, setColumns] = useState(0);
  const { settings, update } = useSettings();

  const closeMenu = () => {
    setMenuId(null);
    setMenuStep('main');
  };

  // Выбранное «плиток в ряд» — верхняя граница: если окно уже, колонок станет
  // меньше, и панель «Вид» сама переключится на меньшее число.
  useEffect(() => {
    if (!settings.tilesPerRow) {
      setColumns(0);
      return;
    }

    const element = gridRef.current;
    if (!element) return;

    const recalc = () => {
      const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
      // Обложка + отступы + минимум места под текст.
      const minCard = 182 * settings.tilesScale + 100;
      const fit = Math.max(1, Math.floor((element.clientWidth + gap) / (minCard + gap)));
      const effective = Math.min(settings.tilesPerRow, fit);
      setColumns(effective);
      // Не влезло — запоминаем меньшее число, чтобы панель показывала правду.
      if (effective < settings.tilesPerRow) update({ tilesPerRow: effective });
    };

    recalc();
    const observer = new ResizeObserver(recalc);
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

  const loadFolders = useCallback(() => {
    api
      .listFolders()
      .then(setFolders)
      .catch(() => setFolders([]));
  }, []);

  useEffect(() => {
    load();
    loadFolders();
    document.title = 'Project Sus';
  }, [load, loadFolders]);

  /** Папки сохраняются списком целиком, поэтому любое изменение — это новый список. */
  const persistFolders = useCallback(
    (next: Folder[]) => {
      setFolders(next);
      api
        .saveFolders(next.map((folder, index) => ({ ...folder, order: index })))
        .then(setFolders)
        .catch(() => {
          setError('Не удалось сохранить папки');
          loadFolders();
        });
    },
    [loadFolders],
  );

  // Порядок «Свои»: новые тексты встают сверху, дальше — как их подвинули.
  const orderedIds = useMemo(() => {
    const ids = (texts ?? []).map((text) => text.id);
    const known = settings.textsOrder.filter((id) => ids.includes(id));
    const fresh = ids.filter((id) => !known.includes(id));
    return [...fresh, ...known];
  }, [texts, settings.textsOrder]);

  const orderIndex = useMemo(
    () => new Map(orderedIds.map((id, index) => [id, index])),
    [orderedIds],
  );

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (texts ?? []).filter((text) => text.title.toLowerCase().includes(needle));
    const inFolder = new Set((folders ?? []).flatMap((folder) => folder.textIds));
    // Во время поиска показываем всё найденное, даже если текст лежит в папке.
    const source = searching ? list : list.filter((text) => !inFolder.has(text.id));

    return [...source].sort((a, b) => {
      if (settings.sort === 'custom') {
        return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
      }
      // В остальных режимах избранные всегда сверху.
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return settings.sort === 'title'
        ? a.title.localeCompare(b.title, 'ru')
        : b.createdAt.localeCompare(a.createdAt);
    });
  }, [texts, query, folders, settings.sort, orderIndex, searching]);

  /** Тексты папок в пользовательском порядке — для веера на главной. */
  const deckFolders = useMemo(
    () =>
      (folders ?? []).map((folder) => ({
        folder,
        texts: folder.textIds
          .map((id) => (texts ?? []).find((text) => text.id === id))
          .filter((text): text is TextMeta => Boolean(text))
          .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)),
      })),
    [folders, texts, orderIndex],
  );

  const folderOf = useCallback(
    (textId: string) => (folders ?? []).find((folder) => folder.textIds.includes(textId)) ?? null,
    [folders],
  );

  const assignText = (textId: string, folderId: string | null) => {
    const base = withoutText(folders ?? [], textId);
    const next = folderId
      ? base.map((folder) =>
          folder.id === folderId ? { ...folder, textIds: [...folder.textIds, textId] } : folder,
        )
      : base;
    persistFolders(next);
  };

  /** В папке уже максимум текстов? */
  const isFolderFull = (folder: Folder): boolean => folder.textIds.length >= MAX_FOLDER_TEXTS;

  /** Папка не взяла текст: карточка «возвращается» на место, папка коротко дёргается. */
  const rejectDrop = (folderId: string, textId: string) => {
    setReturnedId(textId);
    setRejectFolderId(folderId);
    window.clearTimeout(rejectTimer.current);
    rejectTimer.current = window.setTimeout(() => {
      setReturnedId(null);
      setRejectFolderId(null);
    }, 700);
  };

  const tryDropToFolder = (folder: Folder, textId: string) => {
    const already = folder.textIds.includes(textId);
    if (!already && isFolderFull(folder)) {
      rejectDrop(folder.id, textId);
      return;
    }
    assignText(textId, folder.id);
    setDragId(null);
    setOverId(null);
    setFolderDrag(null);
  };

  /** Пасхалка: 67 кликов по логотипу открывают картинку во весь экран. */
  const handleLogoClick = () => {
    logoClicks.current += 1;
    if (logoClicks.current < 67) return;
    logoClicks.current = 0;
    setLightbox('/totya.png');
  };

  const createFolder = (name: string, textId?: string) => {
    const base = textId ? withoutText(folders ?? [], textId) : (folders ?? []);
    const folder: Folder = {
      id: crypto.randomUUID(),
      name: name.trim(),
      textIds: textId ? [textId] : [],
      order: base.length,
    };
    persistFolders([...base, folder]);
  };

  const renameFolder = (id: string, name: string) => {
    persistFolders(
      (folders ?? []).map((folder) => (folder.id === id ? { ...folder, name: name.trim() } : folder)),
    );
  };

  const deleteFolder = (id: string) => {
    persistFolders((folders ?? []).filter((folder) => folder.id !== id));
  };

  /** Меняет две карточки местами — остальные остаются на своих местах. */
  const swap = (dragged: string, target: string) => {
    const from = orderedIds.indexOf(dragged);
    const to = orderedIds.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;

    const next = [...orderedIds];
    [next[from], next[to]] = [next[to], next[from]];
    update({ textsOrder: next });
  };

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
      closeMenu();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuId]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" onClick={handleLogoClick} title="Project Sus">
            S
          </span>
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
            {settings.sort === 'custom' && visible.length > 1 ? (
              <span className="toolbar__hint">Перетащи карточку на другую, чтобы поменять их местами</span>
            ) : null}
          </span>
          <div className="toolbar__right">
            <div className="segmented">
              {SORT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={settings.sort === mode.value ? 'is-active' : ''}
                  onClick={() => update({ sort: mode.value })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setFolderDialog({ mode: 'create' })}
              title="Создать папку для текстов"
            >
              + Папка
            </button>
            <HomeViewSettings />
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

        {!error && texts !== null && visible.length === 0
          ? searching
            ? (
                <div className="state">
                  <p>По запросу «{query}» ничего нет</p>
                  <button type="button" className="btn btn--ghost" onClick={() => setQuery('')}>
                    Сбросить поиск
                  </button>
                </div>
              )
            : texts.length === 0 && (folders?.length ?? 0) === 0
              ? (
                  <div className="state">
                    <p className="state__title">Пока пусто</p>
                    <p>Добавь первый текст — это обычный файл .md</p>
                    <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
                      + Добавить текст
                    </button>
                  </div>
                )
              : null
          : null}

        {!searching && deckFolders.length > 0 ? (
          <section className="folders" aria-label="Папки">
            {deckFolders.map(({ folder, texts: items }) => (
              <FolderDeck
                key={folder.id}
                folder={folder}
                texts={items}
                onOpen={openText}
                onRename={() => setFolderDialog({ mode: 'rename', folder })}
                onDelete={() => deleteFolder(folder.id)}
                onDropText={(textId) => tryDropToFolder(folder, textId)}
                onCardDragStart={(textId) => setFolderDrag(textId)}
                onCardDragEnd={() => setFolderDrag(null)}
                rejecting={rejectFolderId === folder.id}
              />
            ))}
          </section>
        ) : null}

        <div
          ref={gridRef}
          className={`grid${folderDrag ? ' grid--drop' : ''}${columns === 1 ? ' grid--list' : ''}`}
          style={
            {
              '--tile-scale': String(settings.tilesScale),
              gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
            } as CSSProperties
          }
          onDragOver={(event) => {
            // Сюда возвращаем текст из папки: бросил на список — он снова в списке.
            if (!folderDrag) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            if (!folderDrag) return;
            event.preventDefault();
            assignText(folderDrag, null);
            setFolderDrag(null);
          }}
        >
          {visible.map((text) => (
            <article
              className={[
                'card',
                'card--draggable',
                menuId === text.id ? 'card--menu-open' : '',
                dragId === text.id ? 'card--dragging' : '',
                overId === text.id ? 'card--drop' : '',
                returnedId === text.id ? 'card--returned' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={text.id}
              draggable
              onDragStart={(event) => {
                setDragId(text.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', text.id);
              }}
              onDragOver={(event) => {
                // Меняться местами можно только в ручном порядке.
                if (settings.sort !== 'custom' || !dragId || dragId === text.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOverId(text.id);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setOverId((current) => (current === text.id ? null : current));
              }}
              onDrop={(event) => {
                if (settings.sort !== 'custom' || !dragId) return;
                event.preventDefault();
                event.stopPropagation();
                swap(dragId, text.id);
                setDragId(null);
                setOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
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
                  onClick={() => {
                    if (menuId === text.id) {
                      closeMenu();
                      return;
                    }
                    setMenuId(text.id);
                    setMenuStep('main');
                  }}
                >
                  ⋯
                </button>
                {menuId === text.id ? (
                  menuStep === 'folders' ? (
                    <div className="menu">
                      <button type="button" onClick={() => setMenuStep('main')}>
                        ← Назад
                      </button>
                      {(folders ?? []).length === 0 ? (
                        <span className="menu__note">Папок ещё нет</span>
                      ) : (
                        (folders ?? []).map((folder) => {
                          const full = isFolderFull(folder) && !folder.textIds.includes(text.id);
                          return (
                            <button
                              key={folder.id}
                              type="button"
                              disabled={full}
                              title={full ? `В папке уже ${MAX_FOLDER_TEXTS} текстов` : folder.name}
                              onClick={() => {
                                assignText(text.id, folder.id);
                                closeMenu();
                              }}
                            >
                              {folder.name}
                            </button>
                          );
                        })
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          setFolderDialog({ mode: 'create', textId: text.id });
                        }}
                      >
                        ＋ Новая папка…
                      </button>
                      {folderOf(text.id) ? (
                        <button
                          type="button"
                          onClick={() => {
                            assignText(text.id, null);
                            closeMenu();
                          }}
                        >
                          Убрать из папки
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="menu">
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          setRenaming(text);
                        }}
                      >
                        Переименовать
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          pickCover(text);
                        }}
                      >
                        {text.cover ? 'Заменить обложку' : 'Добавить обложку'}
                      </button>
                      {text.cover ? (
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu();
                            void removeCover(text);
                          }}
                        >
                          Убрать обложку
                        </button>
                      ) : null}
                      <button type="button" onClick={() => setMenuStep('folders')}>
                        В папку…
                      </button>
                      <button
                        type="button"
                        className="menu__danger"
                        onClick={() => {
                          closeMenu();
                          setDeleting(text);
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  )
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

      {folderDialog ? (
        <FolderNameDialog
          title={folderDialog.mode === 'create' ? 'Новая папка' : 'Переименовать папку'}
          initial={folderDialog.mode === 'rename' ? folderDialog.folder.name : ''}
          onClose={() => setFolderDialog(null)}
          onSubmit={(name) => {
            if (folderDialog.mode === 'create') createFolder(name, folderDialog.textId);
            else renameFolder(folderDialog.folder.id, name);
            setFolderDialog(null);
          }}
        />
      ) : null}

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

interface FolderNameDialogProps {
  title: string;
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

/** Один диалог и на создание папки, и на переименование. */
function FolderNameDialog({ title, initial, onClose, onSubmit }: FolderNameDialogProps) {
  const [name, setName] = useState(initial);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    onSubmit(clean);
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" form="folder-form" className="btn btn--primary">
            Сохранить
          </button>
        </>
      }
    >
      <form id="folder-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>Название папки</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Рассказы"
          />
        </label>
      </form>
    </Dialog>
  );
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
