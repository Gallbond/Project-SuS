import { Router } from 'express';
import { listFolders, replaceFolders } from '../folders';

export const foldersRouter = Router();

foldersRouter.get('/', (_req, res) => {
  res.json({ folders: listFolders() });
});

// Папки сохраняются списком целиком: { folders: Folder[] }.
foldersRouter.put('/', (req, res) => {
  const { folders } = (req.body ?? {}) as { folders?: unknown };
  res.json({ folders: replaceFolders(folders) });
});
