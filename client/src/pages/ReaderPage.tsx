import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Markdown, type WordHit } from '../components/Markdown';
import { DictionaryDrawer } from '../components/DictionaryDrawer';
import { BookIcon } from '../components/Icons';
import { ReaderSettings } from '../components/ReaderSettings';
import { ThemeToggle } from '../components/ThemeToggle';
import { WordCard } from '../components/WordCard';
import { api, type TextDoc } from '../lib/api';
import { useSettings } from '../lib/settings';

export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<TextDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<WordHit | null>(null);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setDoc(null);
    setError(null);
    setHit(null);
    api
      .getText(id)
      .then((data) => {
        if (alive) setDoc(data);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'Не удалось открыть текст');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    document.title = doc ? `${doc.title} — Project Sus` : 'Project Sus';
  }, [doc]);

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

  return (
    <div className="reader">
      <header className="reader__bar">
        <Link to="/" className="btn btn--ghost">
          ← Назад
        </Link>
        <h1 className="reader__title" title={doc.title}>
          {doc.title}
        </h1>
        <ThemeToggle />
        <ReaderSettings />
      </header>

      <main className="reader__main">
        <article className="reader__article" style={{ fontSize: `${settings.fontSize}px` }}>
          <Markdown
            text={doc.body}
            lang={doc.language}
            onWordClick={(next) => setHit((current) => (current?.element === next.element ? null : next))}
          />
        </article>
        <p className="reader__hint">Клик по слову — перевод и произношение</p>
      </main>

      <WordCard
        hit={hit}
        lang={doc.language}
        text={{ id: doc.id, title: doc.title }}
        onClose={() => setHit(null)}
      />

      <button
        type="button"
        className="fab"
        onClick={() => setDictionaryOpen(true)}
        aria-label="Открыть словарь"
        title="Словарь"
      >
        <BookIcon />
      </button>

      <DictionaryDrawer open={dictionaryOpen} onClose={() => setDictionaryOpen(false)} />
    </div>
  );
}
