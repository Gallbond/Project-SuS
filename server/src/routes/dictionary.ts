import { Router } from 'express';
import { listWords, removeWord, saveWord, setWordHighlight } from '../dictionary';
import { ApiError } from '../errors';

export const dictionaryRouter = Router();

dictionaryRouter.get('/', (_req, res) => {
  res.json({ words: listWords() });
});

dictionaryRouter.post('/', (req, res) => {
  const { word, lang, translation, ipa, textId, textTitle } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof word !== 'string' || !word.trim()) throw new ApiError(400, 'Пустое слово', 'EMPTY_WORD');
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new ApiError(400, 'Пустой перевод', 'EMPTY_TRANSLATION');
  }

  const entry = saveWord({
    word,
    lang: typeof lang === 'string' && lang ? lang : 'pl',
    translation,
    ipa: typeof ipa === 'string' ? ipa : null,
    textId: typeof textId === 'string' ? textId : null,
    textTitle: typeof textTitle === 'string' ? textTitle : null,
  });

  res.status(201).json(entry);
});

dictionaryRouter.patch('/', (req, res) => {
  const { word, lang, highlight } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof word !== 'string' || !word.trim()) throw new ApiError(400, 'Пустое слово', 'EMPTY_WORD');
  if (typeof highlight !== 'boolean') throw new ApiError(400, 'Нужно поле highlight', 'NO_HIGHLIGHT');

  const entry = setWordHighlight(word, typeof lang === 'string' && lang ? lang : 'pl', highlight);
  if (!entry) throw new ApiError(404, 'Слова нет в словаре', 'NOT_FOUND');

  res.json(entry);
});

dictionaryRouter.delete('/', (req, res) => {
  const word = typeof req.query.word === 'string' ? req.query.word : '';
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'pl';
  if (!word.trim()) throw new ApiError(400, 'Не передано слово', 'NO_WORD');
  res.json({ ok: removeWord(word, lang) });
});
