import { Router } from 'express';
import { ApiError } from '../errors';
import { removeReading } from '../reading';
import { createText, deleteCover, deleteText, getText, listTexts, readCover, renameText, setCover, setFavorite } from '../storage';

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
  removeReading(req.params.id);
  res.json({ ok: true });
});

textsRouter.get('/:id/cover', (req, res) => {
  const cover = readCover(req.params.id);
  if (!cover) throw new ApiError(404, 'Обложка не найдена', 'NOT_FOUND');
  res.type(cover.contentType).send(cover.data);
});

textsRouter.post('/:id/cover', async (req, res) => {
  const { dataUrl } = (req.body ?? {}) as { dataUrl?: unknown };
  if (typeof dataUrl !== 'string') throw new ApiError(400, 'Нужно изображение', 'NO_IMAGE');

  const match = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new ApiError(400, 'Поддерживаются PNG, JPEG и WebP', 'BAD_IMAGE');

  const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
  const data = Buffer.from(match[3], 'base64');
  if (data.length > 3_000_000) throw new ApiError(400, 'Обложка слишком большая', 'TOO_LARGE');

  res.json(await setCover(req.params.id, ext, data));
});

textsRouter.delete('/:id/cover', async (req, res) => {
  res.json(await deleteCover(req.params.id));
});

textsRouter.put('/:id/favorite', async (req, res) => {
  const { favorite } = (req.body ?? {}) as { favorite?: unknown };
  if (typeof favorite !== 'boolean') throw new ApiError(400, 'Нужно поле favorite', 'NO_FAVORITE');
  res.json(await setFavorite(req.params.id, favorite));
});
