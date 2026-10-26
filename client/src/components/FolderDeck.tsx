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
}

/**
 * Папка как колода карт: тексты лежат веером, при наведении на папку верхняя
 * карта «достаётся», при наведении на любую карту — поднимается она.
 */
export function FolderDeck({ folder, texts, onOpen, onRename, onDelete, onRemoveText }: FolderDeckProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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

  return (
    <article className="folder" ref={rootRef}>
      <div className={`folder__deck${cards.length ? '' : ' folder__deck--empty'}`}>
        {cards.length === 0 ? (
          <div className="folder__empty">Пусто</div>
        ) : (
          cards.map((text, index) => (
            <div
              key={text.id}
              className={`folder__card${index === cards.length - 1 ? ' folder__card--top' : ''}`}
              style={{ '--i': index } as CSSProperties}
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
