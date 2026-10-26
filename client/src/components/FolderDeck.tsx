import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Folder, TextMeta } from '../lib/api';

/** Сколько карт рисуем в веере; остальные показываем счётчиком «+N». */
const MAX_CARDS = 5;

interface FolderDeckProps {
  folder: Folder;
  texts: TextMeta[];
  onOpen: (id: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onRemoveText: (textId: string) => void;
  /** Бросок карточки текста на папку. */
  onDropText: (textId: string) => void;
}

/**
 * Папка как колода карт веером. Курсор движется по горизонтали — активной
 * становится карта под курсором, она и «достаётся» из колоды. Ушёл курсор —
 * всё возвращается на место.
 */
export function FolderDeck({
  folder,
  texts,
  onOpen,
  onRename,
  onDelete,
  onRemoveText,
  onDropText,
}: FolderDeckProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const cards = texts.slice(0, MAX_CARDS);
  const hidden = texts.length - cards.length;
  const count = cards.length;
  const middle = (count - 1) / 2;

  // Колода компактная: карты лежат стопкой с небольшим сдвигом,
  // чтобы читались края, а не разъехавшийся веер.
  const stepX = count <= 2 ? 34 : count === 3 ? 24 : 16;
  const stepA = count <= 2 ? 8 : count === 3 ? 5 : 3.5;

  return (
    <article
      className={`folder${over ? ' folder--over' : ''}`}
      ref={rootRef}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('text/plain')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const textId = event.dataTransfer.getData('text/plain');
        if (textId) onDropText(textId);
      }}
    >
      <div
        className={`folder__deck${over ? ' folder__deck--over' : ''}${count ? '' : ' folder__deck--empty'}`}
        onMouseMove={(event) => {
          if (!count) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          setActive(Math.min(count - 1, Math.max(0, Math.floor(ratio * count))));
        }}
        onMouseLeave={() => setActive(null)}
      >
        {count === 0 ? (
          <div className="folder__empty">Пусто</div>
        ) : (
          cards.map((text, index) => (
            <div
              key={text.id}
              className={`folder__card${index === active ? ' folder__card--active' : ''}`}
              style={
                {
                  '--i': index,
                  '--shift': index - middle,
                  '--spread-x': `${stepX}px`,
                  '--spread-a': `${stepA}deg`,
                } as CSSProperties
              }
              role="button"
              tabIndex={0}
              title={text.title}
              onClick={() => onOpen(text.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(text.id);
                }
              }}
            >
              {text.cover ? (
                <img src={text.cover} alt="" loading="lazy" />
              ) : (
                <span className="folder__card-name">{text.title}</span>
              )}
              <button
                type="button"
                className="folder__card-remove"
                aria-label={`Убрать «${text.title}» из папки`}
                title="Убрать из папки"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveText(text.id);
                }}
              >
                ×
              </button>
            </div>
          ))
        )}

        {hidden > 0 ? <span className="folder__more">+{hidden}</span> : null}
      </div>

      <div className="folder__foot">
        <div className="folder__title">
          <span className="folder__name" title={folder.name}>
            {folder.name}
          </span>
          <span className="folder__count">{texts.length}</span>
        </div>

        <div className="folder__menu">
          <button
            type="button"
            className="icon-btn icon-btn--small"
            aria-label="Действия с папкой"
            title="Действия с папкой"
            onClick={() => setMenuOpen((value) => !value)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRename();
                }}
              >
                Переименовать
              </button>
              <button
                type="button"
                className="menu__danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                Удалить папку
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
