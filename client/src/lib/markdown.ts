import MarkdownIt from 'markdown-it';

export const md = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
});

type Token = ReturnType<typeof md.parse>[number];

export interface Page {
  tokens: Token[];
  words: number;
  /** Индекс первого слова страницы. */
  start: number;
}

export interface PageLayout {
  charsPerLine: number;
  linesPerPage: number;
}

/**
 * Эталон вёрстки: шрифт 18, колонка 912 px, 27 строк на страницу.
 * Страницы не зависят ни от размера шрифта, ни от разрешения экрана.
 */
export const PAGE_WIDTH = 912;
export const PAGE_FONT_SIZE = 18;
export const PAGE_LINE_HEIGHT = PAGE_FONT_SIZE * 1.75;
export const LINES_PER_PAGE = 27;

export const DEFAULT_LAYOUT: PageLayout = { charsPerLine: 75, linesPerPage: LINES_PER_PAGE };

export function paginate(text: string, layout: PageLayout = DEFAULT_LAYOUT): Page[] {
  const blocks = splitBlocks(md.parse(text, {}));
  if (blocks.length === 0) return [{ tokens: [], words: 0, start: 0 }];

  const heights = measureHeights(blocks);
  if (heights.every((height) => height === 0)) return paginateByChars(blocks, layout);

  const pageHeight = layout.linesPerPage * PAGE_LINE_HEIGHT;
  const pages: Page[] = [];
  const queue = blocks.map((block, index) => ({ block, height: heights[index] }));
  let consumed = 0;

  while (queue.length) {
    const pageTokens: Token[] = [];
    let used = 0;
    let pageWords = 0;
    const pageStart = consumed;

    while (queue.length) {
      const item = queue[0];

      if (used + item.height <= pageHeight + 0.5) {
        queue.shift();
        pageTokens.push(...item.block);
        used += item.height;
        const words = countWords(item.block);
        pageWords += words;
        consumed += words;
        continue;
      }

      // Не влезает: режем абзац по реальной высоте строки.
      const remaining = pageHeight - used;
      const split = isParagraph(item.block) && remaining > PAGE_LINE_HEIGHT ? splitByHeight(item.block, remaining) : null;

      if (split) {
        queue.shift();
        queue.unshift({ block: split.tail, height: measureHeight(split.tail) });
        pageTokens.push(...split.head);
        const words = countWords(split.head);
        pageWords += words;
        consumed += words;
        break;
      }

      // Блок больше страницы и не режется — оставляем как есть (прокрутится).
      if (pageTokens.length === 0) {
        queue.shift();
        pageTokens.push(...item.block);
        const words = countWords(item.block);
        pageWords += words;
        consumed += words;
      }
      break;
    }

    if (pageTokens.length) pages.push({ tokens: pageTokens, words: pageWords, start: pageStart });
  }

  return pages.length ? pages : [{ tokens: [], words: 0, start: 0 }];
}

export function renderPage(page: Page): string {
  return md.renderer.render(page.tokens, md.options, {});
}

function splitBlocks(tokens: Token[]): Token[][] {
  const blocks: Token[][] = [];
  let buffer: Token[] = [];

  for (const token of tokens) {
    buffer.push(token);
    const endsBlock =
      token.level === 0 &&
      (token.nesting === -1 ||
        token.type === 'fence' ||
        token.type === 'code_block' ||
        token.type === 'hr' ||
        token.type === 'html_block');

    if (endsBlock) {
      blocks.push(buffer);
      buffer = [];
    }
  }
  if (buffer.length) blocks.push(buffer);
  return blocks;
}

function isParagraph(block: Token[]): boolean {
  return block[0]?.type === 'paragraph_open';
}

function countWords(block: Token[]): number {
  let text = '';
  for (const token of block) {
    if (token.type === 'inline') text += ` ${token.content}`;
  }
  return text.match(/[\p{L}\p{M}]+/gu)?.length ?? 0;
}

/* ---------- измерение вёрстки ---------- */

function measureStyle(): string {
  return `position:absolute;left:-99999px;top:0;width:${PAGE_WIDTH}px;font-family:var(--font-read);font-size:${PAGE_FONT_SIZE}px;line-height:${PAGE_LINE_HEIGHT}px;`;
}

/** Высоты всех блоков в реальной вёрстке (одним проходом). */
function measureHeights(blocks: Token[][]): number[] {
  try {
    const container = document.createElement('div');
    container.className = 'prose';
    container.style.cssText = measureStyle();

    const holders = blocks.map((tokens) => {
      const holder = document.createElement('div');
      holder.style.overflow = 'hidden';
      holder.innerHTML = md.renderer.render(tokens, md.options, {});
      container.appendChild(holder);
      return holder;
    });

    document.body.appendChild(container);
    const heights = holders.map((holder) => holder.getBoundingClientRect().height);
    container.remove();
    return heights;
  } catch {
    return blocks.map(() => 0);
  }
}

function measureHeight(block: Token[]): number {
  try {
    const probe = document.createElement('div');
    probe.className = 'prose';
    probe.style.cssText = measureStyle();
    probe.innerHTML = md.renderer.render(block, md.options, {});
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  } catch {
    return 0;
  }
}

/** Делит абзац по высоте: возвращает часть, которая влезает, и остаток. */
function splitByHeight(block: Token[], height: number): { head: Token[]; tail: Token[] } | null {
  const inline = block.find((token) => token.type === 'inline');
  if (!inline) return null;

  const content = inline.content;
  if (/[*_`[\]<>]/.test(content)) return null; // с разметкой не рискуем

  const cut = measureCutOffset(content, height);
  if (cut <= 0 || cut >= content.length) return null;

  return {
    head: rebuildBlock(block, content.slice(0, cut)),
    tail: rebuildBlock(block, content.slice(cut).trimStart()),
  };
}

/** Ищет позицию, при которой текст достигает заданной высоты, и откатывается к пробелу. */
function measureCutOffset(content: string, height: number): number {
  try {
    const probe = document.createElement('div');
    probe.style.cssText = measureStyle();
    probe.textContent = content;
    document.body.appendChild(probe);

    const node = probe.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      probe.remove();
      return -1;
    }

    const top = probe.getBoundingClientRect().top;
    const bottomAt = (offset: number) => {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, offset);
      return range.getBoundingClientRect().bottom - top;
    };

    let low = 1;
    let high = content.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (bottomAt(mid) <= height + 0.5) low = mid;
      else high = mid - 1;
    }

    probe.remove();
    const cut = content.lastIndexOf(' ', low);
    return cut > 0 ? cut + 1 : low;
  } catch {
    return -1;
  }
}

/** Копия блока, у которого inline-токен пересобран из нового текста. */
function rebuildBlock(block: Token[], content: string): Token[] {
  return block.map((token) => {
    if (token.type !== 'inline') return { ...token } as Token;
    const parsed = md.parseInline(content, {});
    const children = parsed.length > 0 ? (parsed[0].children ?? []) : [];
    return { ...token, content, children } as Token;
  });
}

/* ---------- запасной путь без DOM ---------- */

function paginateByChars(blocks: Token[][], layout: PageLayout): Page[] {
  const charsPerPage = layout.charsPerLine * layout.linesPerPage;
  const blockOverhead = Math.round(layout.charsPerLine * 0.7);
  const pages: Page[] = [];
  const queue = blocks.slice();
  let consumed = 0;

  while (queue.length) {
    const pageTokens: Token[] = [];
    let used = 0;
    let pageWords = 0;
    const pageStart = consumed;

    while (queue.length) {
      const block = queue[0];
      const cost = blockLength(block) + blockOverhead;

      if (used + cost <= charsPerPage) {
        queue.shift();
        pageTokens.push(...block);
        used += cost;
        const words = countWords(block);
        pageWords += words;
        consumed += words;
        continue;
      }

      if (pageTokens.length === 0) {
        queue.shift();
        pageTokens.push(...block);
        const words = countWords(block);
        pageWords += words;
        consumed += words;
      }
      break;
    }

    if (pageTokens.length) pages.push({ tokens: pageTokens, words: pageWords, start: pageStart });
  }

  return pages.length ? pages : [{ tokens: [], words: 0, start: 0 }];
}

function blockLength(block: Token[]): number {
  let length = 0;
  for (const token of block) {
    if (token.type === 'inline') length += token.content.length;
  }
  return length;
}
