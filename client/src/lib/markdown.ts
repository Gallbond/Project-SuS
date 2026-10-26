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
 * Масштаб интерфейса: исходный макет (18 px на 912 px) увеличен на 10%.
 * Все размеры в styles.css — это значения макета, умноженные на этот коэффициент,
 * а размер шрифта из настроек умножается здесь, при выводе.
 */
export const UI_SCALE = 1.1;

/**
 * Эталон вёрстки: шрифт 18, колонка 912 px, 27 строк на страницу — в единицах макета.
 * В пикселях это 19,8 / 1003,2 / 27; страницы не зависят от разрешения экрана.
 */
export const PAGE_WIDTH = 912 * UI_SCALE;
export const PAGE_FONT_SIZE = 18 * UI_SCALE;
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

      const remaining = pageHeight - used;

      // Абзац не влезает целиком: режем по концу предложения, чтобы страница
      // не обрывалась посреди фразы.
      if (isParagraph(item.block) && remaining > PAGE_LINE_HEIGHT) {
        const split = splitAtSentence(item.block, remaining);

        if (split) {
          queue.shift();
          queue.unshift({ block: split.tail, height: measureHeight(split.tail) });
          pageTokens.push(...split.head);
          const words = countWords(split.head);
          pageWords += words;
          consumed += words;
          break;
        }

        // Ни одна фраза не влезла: на непустой странице переносим абзац
        // целиком — пустой низ страницы лучше разорванной фразы.
        if (pageTokens.length > 0) break;

        // Страница пуста, значит абзац (или одна фраза) сам длиннее страницы —
        // режем по слову, иначе текст никуда не денется.
        const byWord = splitByHeight(item.block, remaining);
        if (byWord) {
          queue.shift();
          queue.unshift({ block: byWord.tail, height: measureHeight(byWord.tail) });
          pageTokens.push(...byWord.head);
          const words = countWords(byWord.head);
          pageWords += words;
          consumed += words;
          break;
        }
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

/** Сокращения, после которых точка не заканчивает предложение. */
const ABBREVIATIONS = new Set([
  'np', 'itd', 'itp', 'tj', 'tzn', 'tzw', 'prof', 'dr', 'hab', 'mgr', 'inż',
  'arch', 'lek', 'płk', 'gen', 'ks', 'bp', 'św', 'ul', 'al', 'pl', 'os', 'nr',
  'str', 'godz', 'tys', 'mln', 'mld', 'min', 'maks', 'ok', 'por', 'zob', 'm.in',
  'p.n.e', 'n.e', 'т.д', 'т.п', 'т.е', 'г', 'стр', 'см', 'рис', 'др',
]);

/** Конец предложения: точка, !, ?, многоточие — возможно, с закрывающей кавычкой. */
const SENTENCE_END_RE = /[.!?…]+[»”"'’”)\]]*(?=\s|$)/gu;

/**
 * Позиции концов предложений в тексте абзаца.
 * Без них страница рвалась бы посреди фразы, на любом слове.
 */
export function sentenceEnds(content: string): number[] {
  const offsets: number[] = [];

  for (const match of content.matchAll(SENTENCE_END_RE)) {
    const index = match.index ?? 0;
    const token = (content.slice(0, index).match(/[\p{L}\p{M}\d.]+$/u)?.[0] ?? '')
      .toLowerCase()
      .replace(/\.+$/, '');

    // Точка после сокращения («np.») или инициала («J.») фразу не кончает.
    if (token && (ABBREVIATIONS.has(token) || /^[\p{L}\p{M}]$/u.test(token))) continue;
    // Маркер списка «1.» — тоже не конец фразы.
    if (/^\d+$/.test(token)) continue;

    offsets.push(index + match[0].length);
  }

  return offsets;
}

/** Режет абзац по последнему предложению, которое влезает в оставшееся место. */
function splitAtSentence(block: Token[], height: number): { head: Token[]; tail: Token[] } | null {
  const inline = block.find((token) => token.type === 'inline');
  if (!inline) return null;

  const content = inline.content;
  if (/[*_`[\]<>]/.test(content)) return null; // с разметкой не рискуем

  const offsets = sentenceEnds(content);
  if (!offsets.length) return null;

  const cut = sentenceCutOffset(content, offsets, height);
  if (cut <= 0 || cut >= content.length) return null;

  const head = content.slice(0, cut);
  const tail = content.slice(cut).trimStart();
  if (!head.trim() || !tail) return null;

  return {
    head: rebuildBlock(block, head),
    tail: rebuildBlock(block, tail),
  };
}

/** Ищет самый дальний конец предложения, который помещается в height. */
function sentenceCutOffset(content: string, offsets: number[], height: number): number {
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
    const heightAt = (offset: number): number => {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, offset);
      return range.getBoundingClientRect().bottom - top;
    };

    let low = 0;
    let high = offsets.length - 1;
    let best = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (heightAt(offsets[mid]) <= height + 0.5) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    probe.remove();
    return best >= 0 ? offsets[best] : -1;
  } catch {
    return -1;
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
