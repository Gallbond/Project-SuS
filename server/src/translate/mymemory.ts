import { ApiError } from '../errors';

const ENDPOINT = 'https://api.mymemory.translated.net/get';

/** Перевод одиночного слова через MyMemory (бесплатно, без ключа). */
export async function translateWithMyMemory(word: string, lang: string, target: string): Promise<string> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', word);
  url.searchParams.set('langpair', `${lang}|${target}`);

  // С email лимит MyMemory выше: 50 000 знаков в день вместо 5 000.
  const email = process.env.MYMEMORY_EMAIL?.trim();
  if (email) url.searchParams.set('de', email);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new ApiError(502, 'Переводчик не отвечает. Проверь интернет.', 'NETWORK');
  }

  if (response.status === 429) {
    throw new ApiError(
      429,
      'Дневной лимит бесплатного переводчика исчерпан. Свои переводы сохраняются, кэш работает.',
      'QUOTA',
    );
  }
  if (!response.ok) {
    throw new ApiError(502, `Переводчик ответил ошибкой ${response.status}`, 'UPSTREAM');
  }

  const payload = (await response.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };

  if (payload.responseStatus === 429) {
    throw new ApiError(
      429,
      'Дневной лимит бесплатного переводчика исчерпан. Свои переводы сохраняются, кэш работает.',
      'QUOTA',
    );
  }
  if (payload.responseStatus !== 200) {
    throw new ApiError(502, 'Переводчик вернул ошибку', 'UPSTREAM');
  }

  const raw = String(payload.responseData?.translatedText ?? '');
  const cleaned = raw.replace(/^[\s"'«»„“]+|[\s"'«»„”]+$/g, '').trim();

  if (!looksLikeTranslation(cleaned, word)) {
    throw new ApiError(502, 'Не удалось перевести это слово', 'BAD_TRANSLATION');
  }
  return cleaned;
}

/**
 * Грубая проверка «похоже ли это на перевод».
 * Машинный сервис иногда отдаёт мусор вроде «КНИГАЕГОИ» — лучше показать
 * честную ошибку и предложить ввести перевод руками, чем этот мусор.
 */
function looksLikeTranslation(text: string, source: string): boolean {
  if (!text) return false;
  if (!/[а-яё]/i.test(text)) return false;
  if (text.toLowerCase() === source.toLowerCase()) return false;

  const letters = text.replace(/[^\p{L}]/gu, '');
  const sourceLetters = source.replace(/[^\p{L}]/gu, '');
  if (letters.length > 3 && letters === letters.toUpperCase() && sourceLetters !== sourceLetters.toUpperCase()) {
    return false;
  }

  return text.length <= source.length * 4 + 12;
}
