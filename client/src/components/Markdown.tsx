import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
});

export interface WordHit {
  word: string;
  element: HTMLElement;
}

interface MarkdownProps {
  text: string;
  lang: string;
  onWordClick: (hit: WordHit) => void;
}

/**
 * Рендерит markdown и превращает слова в кликабельные <span>.
 * Работаем с готовым DOM, а не с токенами: так поддерживается весь markdown
 * без ручного обхода, а html: false исключает XSS.
 */
export function Markdown({ text, lang, onWordClick }: MarkdownProps) {
  const html = useMemo(() => md.render(text), [text]);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef('');

  useEffect(() => {
    if (containerRef.current) wrapWords(containerRef.current, lang);
  }, [html, lang]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    // Если пользователь выделял текст — не мешаем выделению.
    if (selectionRef.current) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('span.w');
    const word = target?.dataset.w;
    if (target && word) onWordClick({ word, element: target });
  };

  return (
    <div
      ref={containerRef}
      className="prose"
      onMouseDown={() => {
        selectionRef.current = window.getSelection()?.toString() ?? '';
      }}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function wrapWords(root: HTMLElement, lang: string): void {
  const segmenter = createSegmenter(lang);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('a, code, pre, span.w')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const segment of segmenter(node.nodeValue ?? '')) {
      if (segment.word) {
        const span = document.createElement('span');
        span.className = 'w';
        span.dataset.w = segment.text;
        span.textContent = segment.text;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(segment.text));
      }
    }
    node.replaceWith(fragment);
  }
}

interface Segment {
  text: string;
  word: boolean;
}

function createSegmenter(lang: string): (value: string) => Segment[] {
  const locale = lang || 'pl';
  if ('Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    return (value) =>
      Array.from(segmenter.segment(value), (part) => ({
        text: part.segment,
        word: Boolean(part.isWordLike),
      }));
  }

  // Запасной путь для старых браузеров.
  const words = /[\p{L}\p{M}]+(?:['’‑-][\p{L}\p{M}]+)*/gu;
  return (value) => {
    const result: Segment[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(words)) {
      const index = match.index ?? 0;
      if (index > lastIndex) result.push({ text: value.slice(lastIndex, index), word: false });
      result.push({ text: match[0], word: true });
      lastIndex = index + match[0].length;
    }
    if (lastIndex < value.length) result.push({ text: value.slice(lastIndex), word: false });
    return result;
  };
}
