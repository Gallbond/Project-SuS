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

export type TranslationSource = 'override' | 'cache' | 'mymemory';

export interface LookupResult {
  word: string;
  translation: string;
  source: TranslationSource;
  cached: boolean;
  ipa: string | null;
  saved: boolean;
}

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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('Сервер недоступен. Проверь, что запущен `npm run dev`.', 'OFFLINE');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiError(body?.error ?? `Ошибка запроса (${response.status})`, body?.code);
  }

  return (await response.json()) as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const api = {
  listTexts: () => request<{ texts: TextMeta[] }>('/api/texts').then((data) => data.texts),

  getText: (id: string) => request<TextDoc>(`/api/texts/${encodeURIComponent(id)}`),

  createText: (input: { title?: string; language?: string; content: string }) =>
    request<TextDoc>('/api/texts', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }),

  renameText: (id: string, title: string) =>
    request<TextDoc>(`/api/texts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ title }),
    }),

  deleteText: (id: string) =>
    request<{ ok: true }>(`/api/texts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  lookup: (word: string, lang: string, signal?: AbortSignal) =>
    request<LookupResult>(
      `/api/lookup?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`,
      { signal },
    ),

  saveOverride: (word: string, lang: string, translation: string) =>
    request<LookupResult>('/api/lookup/override', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ word, lang, translation }),
    }),

  removeOverride: (word: string, lang: string) =>
    request<LookupResult>(
      `/api/lookup/override?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`,
      { method: 'DELETE' },
    ),

  dictionary: () => request<{ words: SavedWord[] }>('/api/dictionary').then((data) => data.words),

  saveWord: (input: {
    word: string;
    lang: string;
    translation: string;
    ipa?: string | null;
    textId?: string | null;
    textTitle?: string | null;
  }) =>
    request<SavedWord>('/api/dictionary', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }),

  removeSavedWord: (word: string, lang: string) =>
    request<{ ok: boolean }>(
      `/api/dictionary?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`,
      { method: 'DELETE' },
    ),
};
