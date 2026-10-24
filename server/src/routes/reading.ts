import { Router } from 'express';
import { ApiError } from '../errors';
import { getReading, saveReading, type Bookmark, type ReadingInput } from '../reading';

export const readingRouter = Router();

function assertId(id: string): void {
  if (!id || /[\\/]/.test(id) || id.includes('..')) {
    throw new ApiError(400, 'Некорректный идентификатор текста', 'BAD_ID');
  }
}

readingRouter.get('/:id', (req, res) => {
  assertId(req.params.id);
  res.json(getReading(req.params.id));
});

readingRouter.put('/:id', (req, res) => {
  const id = req.params.id;
  assertId(id);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: ReadingInput = {};

  if (typeof body.page === 'number') input.page = body.page;
  if (typeof body.pages === 'number') input.pages = body.pages;
  if (Array.isArray(body.readPages)) {
    input.readPages = body.readPages.filter((value): value is number => typeof value === 'number');
  }

  if (Array.isArray(body.bookmarks)) {
    const bookmarks: Bookmark[] = [];
    for (const item of body.bookmarks) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as { page?: unknown; createdAt?: unknown };
      if (typeof candidate.page !== 'number') continue;
      bookmarks.push({
        page: candidate.page,
        createdAt:
          typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
      });
    }
    input.bookmarks = bookmarks;
  }

  res.json(saveReading(id, input));
});
