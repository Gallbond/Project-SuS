import { memo, useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { clearHighlight, setHighlight, supportsHighlights } from '../lib/highlights';

export interface WordHit {
  word: string;
  range: Range;
}

interface MarkdownProps {
  /** Готовый HTML одной страницы (см. lib/markdown.ts). */
  html: string;
  lang: string;
  /** Слова из личного словаря — подсвечиваем их в тексте. */
  savedWords: ReadonlySet<string>;
  onWordClick: (hit: WordHit) => void;
}

/**
 * Рендерит markdown и позволяет кликать по словам без обёрток в DOM.
 *
 * Раньше каждое слово превращалось в <span>: на большом тексте это десятки
 * тысяч элементов, и любая смена темы пересчитывала стили у всех — отсюда
 * тормоза. Теперь слово определяется по координатам клика, а подсветка
 * (наведение, активное слово, словарь) идёт через CSS Custom Highlight API,
 * который не меняет DOM.
 */
export const Markdown = memo(function Markdown({
  html,
  lang,
  savedWords,
  onWordClick,
}: MarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef('');
  const hoverRef = useRef<{ node: Node; offset: number } | null>(null);
  const frameRef = useRef(0);

  const segmenter = useMemo(() => new Intl.Segmenter(lang || 'pl', { granularity: 'word' }), [lang]);

  // Подсветка слов, сохранённых в словарь.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !supportsHighlights()) return;
    setHighlight('sus-saved', collectWordRanges(root, savedWords));
    return () => clearHighlight('sus-saved');
  }, [html, savedWords]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearHighlight('sus-hover');
    };
  }, []);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    // Если пользователь выделял текст — не мешаем.
    if (selectionRef.current) return;
    const root = containerRef.current;
    if (!root) return;

    const found = wordAtPoint(event.clientX, event.clientY, root, segmenter);
    if (!found) return;
    onWordClick(found);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!supportsHighlights() || frameRef.current) return;

    const { clientX, clientY } = event;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const root = containerRef.current;
      if (!root) return;

      const found = wordAtPoint(clientX, clientY, root, segmenter);
      if (!found) {
        if (hoverRef.current) {
          hoverRef.current = null;
          clearHighlight('sus-hover');
        }
        return;
      }

      const same =
        hoverRef.current?.node === found.range.startContainer &&
        hoverRef.current?.offset === found.range.startOffset;
      if (same) return;

      hoverRef.current = { node: found.range.startContainer, offset: found.range.startOffset };
      setHighlight('sus-hover', [found.range]);
    });
  };

  const handleMouseLeave = () => {
    hoverRef.current = null;
    clearHighlight('sus-hover');
  };

  return (
    <div
      ref={containerRef}
      className="prose"
      onMouseDown={() => {
        selectionRef.current = window.getSelection()?.toString() ?? '';
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

interface FoundWord {
  word: string;
  range: Range;
}

function caretAtPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) return { node: position.offsetNode, offset: position.offset };
  }
  return null;
}

function wordAtPoint(
  x: number,
  y: number,
  root: HTMLElement,
  segmenter: Intl.Segmenter,
): FoundWord | null {
  const caret = caretAtPoint(x, y);
  if (!caret) return null;

  const { node, offset } = caret;
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;

  const parent = (node as Text).parentElement;
  if (!parent || parent.closest('a, code, pre')) return null;

  const text = node.nodeValue ?? '';
  if (!text) return null;

  let bounds: { start: number; end: number } | null = null;
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) continue;
    const start = part.index;
    const end = start + part.segment.length;
    if (offset >= start && offset < end) {
      bounds = { start, end };
      break;
    }
    // Клик ровно на границе слова — запоминаем, но следующее слово важнее.
    if (offset === end) bounds = { start, end };
  }
  if (!bounds) return null;

  const range = document.createRange();
  range.setStart(node, bounds.start);
  range.setEnd(node, bounds.end);
  return { word: text.slice(bounds.start, bounds.end), range };
}

/** Диапазоны всех вхождений сохранённых слов — одним регулярным проходом. */
function collectWordRanges(root: HTMLElement, words: ReadonlySet<string>): Range[] {
  if (words.size === 0) return [];

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{M}])(?:${[...words].map(escapeRegExp).join('|')})(?![\\p{L}\\p{M}])`,
    'giu',
  );

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest('a, code, pre')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? '';
    for (const match of value.matchAll(pattern)) {
      const index = match.index ?? 0;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + match[0].length);
      ranges.push(range);
    }
    node = walker.nextNode();
  }
  return ranges;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
