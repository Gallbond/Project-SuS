import { JsonStore } from './store';

export interface CacheEntry {
  translation: string;
  source: string;
  fetchedAt: string;
}

export interface OverrideEntry {
  translation: string;
  updatedAt: string;
}

export const cache = new JsonStore<CacheEntry>('cache.json');
export const overrides = new JsonStore<OverrideEntry>('overrides.json');

/** Ключ один для кэша и правок: язык|перевод|слово. */
export function lookupKey(lang: string, target: string, word: string): string {
  return `${lang}|${target}|${word.trim().toLowerCase()}`;
}
