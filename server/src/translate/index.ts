import { cache, lookupKey, overrides } from '../cache';
import { isSaved, updateSavedTranslation } from '../dictionary';
import { ApiError } from '../errors';
import { lookupIPA } from '../ipa';
import { getNote } from '../notes';
import { translateWithMyMemory } from './mymemory';

export type TranslationSource = 'override' | 'cache' | 'mymemory';

export interface LookupResult {
  word: string;
  translation: string;
  source: TranslationSource;
  cached: boolean;
  ipa: string | null;
  saved: boolean;
  /** Заметка отдаётся всегда: иначе клиент теряет её после правки перевода. */
  note: string;
}

const LANG_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

function assertLang(value: string, field: string): string {
  if (!LANG_RE.test(value)) throw new ApiError(400, `Некорректный код языка (${field})`, 'BAD_LANG');
  return value.toLowerCase();
}

export async function lookup(word: string, lang: string, target: string): Promise<LookupResult> {
  const clean = word.trim();
  if (!clean) throw new ApiError(400, 'Пустое слово', 'EMPTY_WORD');
  if (clean.length > 100) throw new ApiError(400, 'Слишком длинное слово', 'TOO_LONG');

  const from = assertLang(lang, 'lang');
  const to = assertLang(target, 'target');
  const key = lookupKey(from, to, clean);
  const ipaPromise = lookupIPA(clean, from);
  const saved = isSaved(clean, from);
  const note = getNote(clean, from);

  const override = overrides.get(key);
  if (override) {
    return {
      word: clean,
      translation: override.translation,
      source: 'override',
      cached: false,
      ipa: await ipaPromise,
      saved,
      note,
    };
  }

  const cached = cache.get(key);
  if (cached) {
    return {
      word: clean,
      translation: cached.translation,
      source: 'cache',
      cached: true,
      ipa: await ipaPromise,
      saved,
      note,
    };
  }

  const translation = await translateWithMyMemory(clean, from, to);
  cache.set(key, { translation, source: 'mymemory', fetchedAt: new Date().toISOString() });

  return {
    word: clean,
    translation,
    source: 'mymemory',
    cached: false,
    ipa: await ipaPromise,
    saved,
    note,
  };
}

export async function saveOverride(
  word: string,
  lang: string,
  translation: string,
  target: string,
): Promise<LookupResult> {
  const clean = word.trim();
  const text = translation.trim();
  if (!clean) throw new ApiError(400, 'Пустое слово', 'EMPTY_WORD');
  if (!text) throw new ApiError(400, 'Перевод не может быть пустым', 'EMPTY_TRANSLATION');

  const from = assertLang(lang, 'lang');
  const to = assertLang(target, 'target');
  overrides.set(lookupKey(from, to, clean), { translation: text, updatedAt: new Date().toISOString() });
  // Если слово уже лежит в словаре — держим и там актуальный перевод.
  updateSavedTranslation(clean, from, text);

  return {
    word: clean,
    translation: text,
    source: 'override',
    cached: false,
    ipa: await lookupIPA(clean, from),
    saved: isSaved(clean, from),
    note: getNote(clean, from),
  };
}

/** Убирает свою правку и возвращает перевод из кэша или сервиса. */
export async function removeOverride(
  word: string,
  lang: string,
  target: string,
): Promise<LookupResult> {
  const clean = word.trim();
  const from = assertLang(lang, 'lang');
  const to = assertLang(target, 'target');
  overrides.delete(lookupKey(from, to, clean));
  return lookup(clean, from, to);
}
