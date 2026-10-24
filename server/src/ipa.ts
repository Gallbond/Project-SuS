import { JsonStore } from './store';

interface IpaEntry {
  value: string | null;
  checkedAt: string;
}

const store = new JsonStore<IpaEntry>('ipa.json');

/** Если слова нет в словаре, не дёргаем его повторно три дня. */
const NEGATIVE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Транскрипция (IPA) по слову. Источник — Викисловарь для нужного языка.
 * Ошибки сети не кэшируем и не пробрасываем: транскрипция — украшение,
 * из-за неё карточка перевода падать не должна.
 */
export async function lookupIPA(word: string, lang: string): Promise<string | null> {
  const clean = word.trim();
  if (!clean) return null;

  const key = `${lang.toLowerCase()}|${clean.toLowerCase()}`;
  const cached = store.get(key);
  if (cached) {
    if (cached.value !== null) return cached.value;
    if (Date.now() - Date.parse(cached.checkedAt) < NEGATIVE_TTL_MS) return null;
  }

  try {
    const value = await fetchIPA(clean, lang);
    store.set(key, { value, checkedAt: new Date().toISOString() });
    return value;
  } catch {
    return null;
  }
}

async function fetchIPA(word: string, lang: string): Promise<string | null> {
  const url = new URL(`https://${lang.toLowerCase()}.wiktionary.org/w/api.php`);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', word);
  url.searchParams.set('prop', 'wikitext');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('redirects', '1');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { 'User-Agent': 'ProjectSus/0.1 (personal reading tool)' },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { parse?: { wikitext?: string } };
  const wikitext = payload.parse?.wikitext;
  if (!wikitext) return null; // страницы нет
  return extractIPA(wikitext);
}

/** Достаёт IPA из польской секции статьи Викисловаря. */
export function extractIPA(wikitext: string): string | null {
  const section = polishSection(wikitext);

  for (const match of section.matchAll(/\{\{(IPA\d?)\s*\|([^}]*)\}\}/gi)) {
    const params = match[2]
      .split('|')
      .map((part) => part.trim())
      .filter((part) => part && part !== 'pl');
    const stressed = params.find((part) => /[ˈˌ]/.test(part));
    const value = stressed ?? params[0];
    if (value) return cleanIPA(value);
  }
  return null;
}

/** Оставляет только польскую секцию статьи (первую, если их несколько). */
function polishSection(wikitext: string): string {
  const lines = wikitext.split('\n');
  const start = lines.findIndex((line) => line.startsWith('==') && line.includes('{{język polski}}'));
  if (start === -1) return wikitext;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^==[^=]/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function cleanIPA(value: string): string {
  return value
    .replace(/\[\[|\]\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]$/, '')
    .trim();
}
