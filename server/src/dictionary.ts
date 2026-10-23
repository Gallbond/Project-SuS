import { JsonStore } from './store';

export interface SavedWord {
  id: string;
  word: string;
  lang: string;
  translation: string;
  ipa: string | null;
  textId: string | null;
  textTitle: string | null;
  createdAt: string;
}

const store = new JsonStore<SavedWord>('dictionary.json');

function keyOf(word: string, lang: string): string {
  return `${lang.toLowerCase()}|${word.trim().toLowerCase()}`;
}

export function listWords(): SavedWord[] {
  return Object.values(store.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isSaved(word: string, lang: string): boolean {
  return Boolean(store.get(keyOf(word, lang)));
}

export interface SaveWordInput {
  word: string;
  lang: string;
  translation: string;
  ipa?: string | null;
  textId?: string | null;
  textTitle?: string | null;
}

/** Повторное сохранение того же слова обновляет перевод, а не плодит дубликат. */
export function saveWord(input: SaveWordInput): SavedWord {
  const key = keyOf(input.word, input.lang);
  const existing = store.get(key);

  const entry: SavedWord = {
    id: key,
    word: input.word.trim(),
    lang: input.lang.toLowerCase(),
    translation: input.translation.trim(),
    ipa: input.ipa ?? existing?.ipa ?? null,
    textId: input.textId ?? existing?.textId ?? null,
    textTitle: input.textTitle ?? existing?.textTitle ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  store.set(key, entry);
  return entry;
}

export function removeWord(word: string, lang: string): boolean {
  return store.delete(keyOf(word, lang));
}

/** Если слово уже сохранено, а перевод поправили — обновляем и запись в словаре. */
export function updateSavedTranslation(word: string, lang: string, translation: string): void {
  const key = keyOf(word, lang);
  const existing = store.get(key);
  if (!existing) return;
  store.set(key, { ...existing, translation: translation.trim() });
}
