import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Folder, TextMeta } from '../lib/api';

/** Сколько карт рисуем в веере; остальные видны по счётчику в подписи папки. */
const MAX_CARDS = 8;

interface FolderDeckProps {
  folder: Folder;
  texts: TextMeta[];
  onOpen: (id: string) => void;
  onRename: () => void;
  onDelete: () => void;
  /** Бросок карточки текста на папку. */
  onDropText: (textId: string) => void;
  /** Карту достали из колоды и повезли — например, обратно в список текстов. */
  onCardDragStart: (textId: string) => void;
  onCardDragEnd: () => void;
}

/**
 * Папка как колода карт веером. Курсор движется по горизонтали — карта под
 * курсором «достаётся» из колоды, ушёл курсор — всё возвращается. Карту можно
 * утащить из папки и бросить в список текстов.
 */
export function FolderDeck({
  folder,
  texts,
  onOpen,
  onRename,
  onDelete,
  onDropText,
  onCardDragStart,
  onCardDragEnd,
}: FolderDeckProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
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
  const count = cards.length;
  const middle = (count - 1) / 2;

  // Шаг веера в процентах от ширины папки. С двумя-тремя картами он шире,
  // дальше — поджимается, чтобы весь веер влезал в ширину папки.
  const stepX = count <= 2 ? 20 : count === 3 ? 18 : Math.min(16, 70 / Math.max(1, count - 1));
  const stepA = count <= 2 ? 7 : count === 3 ? 5 : 4;

  // Сброс состояния при смене состава папки: если карту утащили (и браузер
  // не прислал dragend), она не должна остаться полупрозрачной при возврате.
  useEffect(() => {
    setActive(null);
    setDragging(null);
  }, [count]);

  /** Активная карта — верхняя из тех, что накрывают курсор по горизонтали. */
  const pickActive = (deck: HTMLDivElement, clientX: number): void => {
    if (!count) return;
    const rect = deck.getBoundingClientRect();
    const stepPx = (stepX / 100) * rect.width;
    const cardWidth = deck.querySelector<HTMLElement>('.folder__card')?.offsetWidth ?? 0;
    const offset = clientX - rect.left - rect.width / 2;

    let best = 0;
    for (let index = 0; index < count; index += 1) {
      const leftEdge = (index - middle) * stepPx - cardWidth / 2;
      if (offset >= leftEdge) best = index;
    }
    setActive(best);
  };

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
        onMouseMove={(event) => pickActive(event.currentTarget, event.clientX)}
        onMouseLeave={() => setActive(null)}
      >
        {count === 0 ? (
          <div className="folder__empty">Пусто</div>
        ) : (
          cards.map((text, index) => (
            <div
              key={text.id}
              className={[
                'folder__card',
                index === active ? 'folder__card--active' : '',
                dragging === text.id ? 'folder__card--dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  '--i': index,
                  '--shift': index - middle,
                  '--spread-x': `${stepX}cqw`,
                  '--spread-a': `${stepA}deg`,
                  // Обложка — фон карточки, а не <img>: так название всегда сверху,
                  // а вытянутые фото корректно обрезаются по формату 2:3.
                  backgroundImage: text.cover ? `url("${text.cover}")` : undefined,
                } as CSSProperties
              }
              role="button"
              tabIndex={0}
              draggable
              title={`${text.title} — перетащи в список, чтобы убрать из папки`}
              onDragStart={(event) => {
                setDragging(text.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', text.id);
                onCardDragStart(text.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                onCardDragEnd();
              }}
              onClick={() => onOpen(text.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen(text.id);
                }
              }}
            >
              <span className="folder__card-title">
                <span className="folder__card-title-text">{text.title}</span>
              </span>
            </div>
          ))
        )}
      </div>

      <div className="folder__foot">
        <div className="folder__title">
          <span className="folder__name" title={folder.name}>
            {folder.name}
          </span>
          <span className="folder__count">{texts.length}</span>
          {texts.length > cards.length ? (
            <span className="folder__more" title="В веере показаны не все тексты">
              +{texts.length - cards.length}
            </span>
          ) : null}
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
