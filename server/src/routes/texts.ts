import { Router } from 'express';
import { ApiError } from '../errors';
import { createText, deleteText, getText, listTexts, renameText } from '../storage';

export const textsRouter = Router();

textsRouter.get('/', async (_req, res) => {
  res.json({ texts: await listTexts() });
});

textsRouter.get('/:id', async (req, res) => {
  res.json(await getText(req.params.id));
});

textsRouter.post('/', async (req, res) => {
  const { title, language, content } = (req.body ?? {}) as {
    title?: unknown;
    language?: unknown;
    content?: unknown;
  };

  if (typeof content !== 'string') {
    throw new ApiError(400, 'Не передан текст', 'NO_CONTENT');
  }

  const doc = await createText({
    title: typeof title === 'string' ? title : undefined,
    language: typeof language === 'string' ? language : undefined,
    content,
  });
  res.status(201).json(doc);
});

textsRouter.patch('/:id', async (req, res) => {
  const { title } = (req.body ?? {}) as { title?: unknown };
  if (typeof title !== 'string') throw new ApiError(400, 'Не передано новое название', 'NO_TITLE');
  res.json(await renameText(req.params.id, title));
});

textsRouter.delete('/:id', async (req, res) => {
  await deleteText(req.params.id);
  res.json({ ok: true });
});
