import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { api } from '../lib/api';
import { Dialog } from './Dialog';

interface AddTextDialogProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

type Tab = 'file' | 'paste';

const LANGUAGES = [
  { code: 'pl', label: 'Польский' },
  { code: 'en', label: 'Английский' },
  { code: 'de', label: 'Немецкий' },
  { code: 'es', label: 'Испанский' },
  { code: 'fr', label: 'Французский' },
  { code: 'it', label: 'Итальянский' },
  { code: 'uk', label: 'Украинский' },
  { code: 'cs', label: 'Чешский' },
];

const FILE_RE = /\.(md|markdown|txt)$/i;

export function AddTextDialog({ onClose, onCreated }: AddTextDialogProps) {
  const [tab, setTab] = useState<Tab>('file');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('pl');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    if (!FILE_RE.test(file.name)) {
      setError('Нужен файл .md, .markdown или .txt');
      return;
    }
    if (file.size > 1024 * 1024) {
      setError('Файл больше 1 МБ — многовато для одного текста');
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      setError('Файл пустой');
      return;
    }
    setContent(text);
    setFileName(file.name);
    if (!title.trim()) setTitle(file.name.replace(FILE_RE, ''));
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!content.trim()) {
      setError('Сначала добавь текст');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const doc = await api.createText({ title: title.trim() || undefined, language, content });
      onCreated(doc.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить текст');
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Добавить текст"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            form="add-text-form"
            className="btn btn--primary"
            disabled={saving || !content.trim()}
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'file'}
          className={`tab${tab === 'file' ? ' is-active' : ''}`}
          onClick={() => setTab('file')}
        >
          Файл .md
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'paste'}
          className={`tab${tab === 'paste' ? ' is-active' : ''}`}
          onClick={() => setTab('paste')}
        >
          Вставить текст
        </button>
      </div>

      <form id="add-text-form" className="form" onSubmit={handleSubmit}>
        {tab === 'file' ? (
          <div
            className={`dropzone${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".md,.markdown,.txt"
              hidden
              onChange={handleFileInput}
            />
            {fileName ? (
              <>
                <strong>{fileName}</strong>
                <span>Файл прочитан — можно сохранять</span>
              </>
            ) : (
              <>
                <strong>Перетащи сюда .md</strong>
                <span>или нажми, чтобы выбрать файл</span>
              </>
            )}
          </div>
        ) : (
          <label className="field">
            <span>Текст</span>
            <textarea
              rows={10}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={'# Заголовок\n\nТекст на польском…'}
            />
          </label>
        )}

        <div className="form__row">
          <label className="field">
            <span>Название</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: List do przyjaciela"
            />
          </label>
          <label className="field field--narrow">
            <span>Язык текста</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="form__error">{error}</p> : null}
        <p className="form__hint">
          Перевод всегда на русский. Файл сохранится в папку <code>texts/</code>.
        </p>
      </form>
    </Dialog>
  );
}
