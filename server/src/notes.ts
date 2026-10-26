import { JsonStore } from './store';

export interface Note {
  text: string;
  updatedAt: string;
}

const store = new JsonStore<Note>('notes.json');

function key(word: string, lang: string): string {
  return `${lang.toLowerCase()}|${word.trim().toLowerCase()}`;
}

export function getNote(word: string, lang: string): string {
  return store.get(key(word, lang))?.text ?? '';
}

/** Пустая заметка удаляет запись — чтобы файл не пух пустыми строками. */
export function setNote(word: string, lang: string, text: string): string {
  const clean = text.trim();
  const storeKey = key(word, lang);

  if (!clean) {
    store.delete(storeKey);
    return '';
  }

  store.set(storeKey, { text: clean, updatedAt: new Date().toISOString() });
  return clean;
}

/** Удаляет заметку — например, когда слово убирают из словаря. */
export function deleteNote(word: string, lang: string): void {
  store.delete(key(word, lang));
}
