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

/** Применяет правку ко всем папкам и пишет файл, только если что-то изменилось. */
function updateFolders(map: (folder: Folder) => Folder): void {
  const current = Object.values(store.all());
  const next = current.map(map);
  if (next.every((folder, index) => folder === current[index])) return;

  store.replaceAll(Object.fromEntries(next.map((folder) => [folder.id, folder])));
}

/** Текст переименовали (сменился id) — обновляем ссылки во всех папках. */
export function replaceTextId(fromId: string, toId: string): void {
  updateFolders((folder) =>
    folder.textIds.includes(fromId)
      ? { ...folder, textIds: folder.textIds.map((id) => (id === fromId ? toId : id)) }
      : folder,
  );
}

/** Текст удалили — убираем его из папок, чтобы он не занимал слот. */
export function forgetText(textId: string): void {
  updateFolders((folder) =>
    folder.textIds.includes(textId)
      ? { ...folder, textIds: folder.textIds.filter((id) => id !== textId) }
      : folder,
  );
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
