import { JsonStore } from './store';

export interface Bookmark {
  page: number;
  createdAt: string;
}

export interface ReadingState {
  page: number;
  pages: number;
  /** Какие страницы пользователь уже видел — для процента прочитанного. */
  readPages: number[];
  /** Закладок может быть несколько. */
  bookmarks: Bookmark[];
  updatedAt: string;
}

/** Старое состояние хранило одну закладку в поле bookmark. */
interface StoredReading extends ReadingState {
  bookmark?: Bookmark | null;
}

const store = new JsonStore<StoredReading>('reading.json');

export function emptyReading(): ReadingState {
  return { page: 1, pages: 0, readPages: [], bookmarks: [], updatedAt: '' };
}

export function getReading(textId: string): ReadingState {
  const stored = store.get(textId);
  if (!stored) return emptyReading();

  const raw = Array.isArray(stored.bookmarks)
    ? stored.bookmarks
    : stored.bookmark
      ? [stored.bookmark]
      : [];
  // Битая запись в JSON не должна ронять читалку.
  const bookmarks = raw.filter(
    (item): item is Bookmark => Boolean(item) && typeof item.page === 'number',
  );

  return { ...emptyReading(), ...stored, bookmarks };
}

export function removeReading(textId: string): void {
  store.delete(textId);
}

/** Переносит прогресс на новый id — при переименовании текста. */
export function moveReading(fromId: string, toId: string): void {
  const stored = store.get(fromId);
  if (!stored) return;
  store.delete(fromId);
  store.set(toId, stored);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export interface ReadingInput {
  page?: number;
  pages?: number;
  readPages?: number[];
  bookmarks?: Bookmark[];
}

export function saveReading(textId: string, input: ReadingInput): ReadingState {
  const current = getReading(textId);

  const pages = clamp(input.pages ?? current.pages, 0, 100_000);
  const maxPage = Math.max(1, pages);
  const page = clamp(input.page ?? current.page, 1, maxPage);

  const readPages = [
    ...new Set((input.readPages ?? current.readPages).map((value) => clamp(value, 1, maxPage))),
  ].sort((a, b) => a - b);

  const byPage = new Map<number, Bookmark>();
  for (const item of input.bookmarks ?? current.bookmarks) {
    if (!item || typeof item.page !== 'number') continue;
    const normalized: Bookmark = {
      page: clamp(item.page, 1, maxPage),
      createdAt: item.createdAt || new Date().toISOString(),
    };
    byPage.set(normalized.page, normalized);
  }
  const bookmarks = [...byPage.values()].sort((a, b) => a.page - b.page);

  const next: ReadingState = {
    page,
    pages,
    readPages,
    bookmarks,
    updatedAt: new Date().toISOString(),
  };

  store.set(textId, next);
  return next;
}
