import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { ApiError } from './errors';
import { TEXTS_DIR } from './paths';

export interface TextMeta {
  id: string;
  title: string;
  language: string;
  level?: string;
  tags: string[];
  words: number;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TextDoc extends TextMeta {
  body: string;
}

const TEXT_FILE = /\.(md|markdown|txt)$/i;

/** Транслитерация для безопасных имён файлов. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ł: 'l', ą: 'a', ć: 'c', ę: 'e', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  ä: 'a', ö: 'o', ü: 'u', ß: 'ss',
};

export function slugify(title: string): string {
  let out = '';
  for (const ch of title.toLowerCase()) out += TRANSLIT[ch] ?? ch;
  const slug = out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || `text-${Date.now().toString(36)}`;
}

export async function ensureTextsDir(): Promise<void> {
  await fsp.mkdir(TEXTS_DIR, { recursive: true });
}

function assertId(id: string): void {
  if (!id || id !== path.basename(id) || id.includes('..') || /[\\/]/.test(id)) {
    throw new ApiError(400, 'Некорректный идентификатор текста', 'BAD_ID');
  }
}

function stripMarkup(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, ' ');
}

const WORD_RE = /[\p{L}\p{M}]+(?:['’‑-][\p{L}\p{M}]+)*/gu;

function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

function makeExcerpt(text: string, max = 150): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

function firstHeading(body: string): string | null {
  const match = body.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].replace(/[*_`]/g, '').trim() : null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

async function readDoc(id: string): Promise<TextDoc> {
  assertId(id);
  const file = path.join(TEXTS_DIR, `${id}.md`);
  const [raw, stat] = await Promise.all([fsp.readFile(file, 'utf8'), fsp.stat(file)]);
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const body = parsed.content.trim();
  const plain = stripMarkup(body);
  // В превью не нужен заголовок — он дублирует название текста.
  const plainForExcerpt = stripMarkup(body.replace(/^#{1,6}[^\n]*$/gm, ''));

  return {
    id,
    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim()
        : (firstHeading(body) ?? id),
    language: typeof data.language === 'string' && data.language.trim() ? data.language.trim() : 'pl',
    level: typeof data.level === 'string' ? data.level : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    words: countWords(plain),
    excerpt: makeExcerpt(plainForExcerpt),
    createdAt: toIso(data.created) ?? stat.mtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    body,
  };
}

function toMeta(doc: TextDoc): TextMeta {
  return {
    id: doc.id,
    title: doc.title,
    language: doc.language,
    level: doc.level,
    tags: doc.tags,
    words: doc.words,
    excerpt: doc.excerpt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listTexts(): Promise<TextMeta[]> {
  await ensureTextsDir();
  const entries = await fsp.readdir(TEXTS_DIR, { withFileTypes: true });
  const docs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && TEXT_FILE.test(entry.name) && !entry.name.startsWith('.'))
      .map((entry) => readDoc(entry.name.replace(TEXT_FILE, '')).catch(() => null)),
  );
  return docs
    .filter((doc): doc is TextDoc => doc !== null)
    .map(toMeta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getText(id: string): Promise<TextDoc> {
  try {
    return await readDoc(id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ApiError(404, 'Текст не найден', 'NOT_FOUND');
    }
    throw error;
  }
}

async function uniqueId(base: string): Promise<string> {
  let id = base;
  let suffix = 2;
  while (fs.existsSync(path.join(TEXTS_DIR, `${id}.md`))) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

export interface CreateTextInput {
  title?: string;
  language?: string;
  content: string;
}

export async function createText(input: CreateTextInput): Promise<TextDoc> {
  if (!input.content?.trim()) {
    throw new ApiError(400, 'Текст пустой — нечего сохранять', 'EMPTY_TEXT');
  }
  await ensureTextsDir();

  const parsed = matter(input.content);
  const body = parsed.content.trim();
  const fm = parsed.data as Record<string, unknown>;

  const title = (
    input.title?.trim() ||
    (typeof fm.title === 'string' ? fm.title.trim() : '') ||
    firstHeading(body) ||
    'Без названия'
  ).slice(0, 140);

  const language = (
    input.language?.trim() ||
    (typeof fm.language === 'string' ? fm.language.trim() : '') ||
    'pl'
  ).slice(0, 12);

  const created = (toIso(fm.created) ?? new Date().toISOString()).slice(0, 10);
  const id = await uniqueId(slugify(title));

  const file = matter.stringify(body, { title, language, created });
  await fsp.writeFile(path.join(TEXTS_DIR, `${id}.md`), file, 'utf8');
  return readDoc(id);
}

export async function renameText(id: string, title: string): Promise<TextDoc> {
  const clean = title?.trim();
  if (!clean) throw new ApiError(400, 'Название не может быть пустым', 'EMPTY_TITLE');

  const doc = await getText(id);
  const nextId = slugify(clean);
  const targetId = nextId === id ? id : await uniqueId(nextId);

  const frontmatter: Record<string, unknown> = {
    title: clean,
    language: doc.language,
    created: doc.createdAt.slice(0, 10),
  };
  if (doc.level) frontmatter.level = doc.level;
  if (doc.tags.length) frontmatter.tags = doc.tags;

  const file = matter.stringify(doc.body, frontmatter);
  await fsp.writeFile(path.join(TEXTS_DIR, `${targetId}.md`), file, 'utf8');
  if (targetId !== id) await fsp.rm(path.join(TEXTS_DIR, `${id}.md`));

  return readDoc(targetId);
}

export async function deleteText(id: string): Promise<void> {
  assertId(id);
  try {
    await fsp.rm(path.join(TEXTS_DIR, `${id}.md`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ApiError(404, 'Текст не найден', 'NOT_FOUND');
    }
    throw error;
  }
}
