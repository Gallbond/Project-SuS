import { ApiError } from './errors';
import { JsonStore } from './store';

export interface Folder {
  id: string;
  name: string;
  /** Тексты папки по порядку; текст живёт не больше чем в одной папке. */
  textIds: string[];
  /** Позиция папки на главной. */
  order: number;
}

const MAX_NAME = 60;
const store = new JsonStore<Folder>('folders.json');

export function listFolders(): Folder[] {
  return Object.values(store.all()).sort((a, b) => a.order - b.order);
}

/**
 * Папки сохраняются целиком: их немного, а порядок и состав меняются вместе.
 * Поэтому один PUT присылает весь список, сервер его нормализует и записывает.
 */
export function replaceFolders(input: unknown): Folder[] {
  if (!Array.isArray(input)) {
    throw new ApiError(400, 'Ожидается массив папок', 'BAD_FOLDERS');
  }

  const ids = new Set<string>();
  const usedTexts = new Set<string>();
  const folders: Folder[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, MAX_NAME) : '';
    if (!id || !name || ids.has(id)) continue;

    const textIds: string[] = [];
    if (Array.isArray(item.textIds)) {
      for (const value of item.textIds) {
        // Текст может быть только в одной папке — остальные вхождения отбрасываем.
        if (typeof value !== 'string' || !value || usedTexts.has(value)) continue;
        usedTexts.add(value);
        textIds.push(value);
      }
    }

    ids.add(id);
    folders.push({ id, name, textIds, order: folders.length });
  }

  store.replaceAll(Object.fromEntries(folders.map((folder) => [folder.id, folder])));
  return folders;
}
