import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type TextMeta } from '../lib/api';
import { AddTextDialog } from '../components/AddTextDialog';
import { Dialog } from '../components/Dialog';
import { DictionaryDrawer } from '../components/DictionaryDrawer';
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
    return [...list].sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title, 'ru') : b.createdAt.localeCompare(a.createdAt),
    );
  }, [texts, query, sort]);

  const openText = (id: string) => navigate(`/text/${encodeURIComponent(id)}`);

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

        <div className="grid">
          {visible.map((text) => (
            <article className={`card${menuId === text.id ? ' card--menu-open' : ''}`} key={text.id}>
              <button type="button" className="card__main" onClick={() => openText(text.id)}>
                <span className="badge">{text.language.toUpperCase()}</span>
                <h2 className="card__title">{text.title}</h2>
                <p className="card__excerpt">{text.excerpt || 'Пустой текст'}</p>
                <span className="card__meta">
                  {text.words} {pluralWords(text.words)} · {formatDate(text.createdAt)}
                </span>
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
    </div>
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
