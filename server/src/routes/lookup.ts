import { Router } from 'express';
import { ApiError } from '../errors';
import { setNote } from '../notes';
import { lookup, removeOverride, saveOverride } from '../translate';

export const lookupRouter = Router();

function queryString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}

lookupRouter.get('/', async (req, res) => {
  const word = queryString(req.query.word, '');
  const lang = queryString(req.query.lang, 'pl');
  const target = queryString(req.query.target, 'ru');
  res.json(await lookup(word, lang, target));
});

lookupRouter.put('/note', async (req, res) => {
  const { word, lang, text } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof word !== 'string' || !word.trim() || typeof text !== 'string') {
    throw new ApiError(400, 'Нужны поля word и text', 'BAD_REQUEST');
  }
  res.json({ note: setNote(word, typeof lang === 'string' ? lang : 'pl', text) });
});

lookupRouter.put('/override', async (req, res) => {
  const { word, lang, target, translation } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof word !== 'string' || typeof translation !== 'string') {
    throw new ApiError(400, 'Нужны поля word и translation', 'BAD_REQUEST');
  }
  res.json(
    await saveOverride(
      word,
      typeof lang === 'string' ? lang : 'pl',
      translation,
      typeof target === 'string' ? target : 'ru',
    ),
  );
});

lookupRouter.delete('/override', async (req, res) => {
  const word = queryString(req.query.word, '');
  const lang = queryString(req.query.lang, 'pl');
  const target = queryString(req.query.target, 'ru');
  res.json(await removeOverride(word, lang, target));
});
