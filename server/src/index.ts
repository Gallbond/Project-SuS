import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ApiError } from './errors';
import { backupData } from './backup';
import { CLIENT_DIST } from './paths';
import { lookupRouter } from './routes/lookup';
import { dictionaryRouter } from './routes/dictionary';
import { foldersRouter } from './routes/folders';
import { readingRouter } from './routes/reading';
import { textsRouter } from './routes/texts';
import { ensureTextsDir } from './storage';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, texts: true });
});

app.use('/api/texts', textsRouter);
app.use('/api/lookup', lookupRouter);
app.use('/api/dictionary', dictionaryRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/reading', readingRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Такого метода нет', code: 'NOT_FOUND' });
});

// В продакшене отдаём собранный клиент с того же порта.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[server]', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
});

await ensureTextsDir();
backupData();
app.listen(port, () => {
  console.log(`Project Sus API: http://localhost:${port}`);
});
