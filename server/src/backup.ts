import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths';

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const KEEP_DAYS = 14;

/**
 * Раз в день складывает копию данных (словарь, правки, прогресс) в
 * server/data/backups/<дата>/. Запускается при старте сервера.
 */
export function backupData(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) return;

    const files = fs.readdirSync(DATA_DIR).filter((name) => name.endsWith('.json'));
    if (files.length === 0) return;

    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUPS_DIR, day);
    if (fs.existsSync(target)) return;

    fs.mkdirSync(target, { recursive: true });
    for (const name of files) {
      fs.copyFileSync(path.join(DATA_DIR, name), path.join(target, name));
    }

    prune();
  } catch (error) {
    console.warn('[backup] не удалось сохранить копию данных:', error);
  }
}

function prune(): void {
  const days = fs
    .readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  while (days.length > KEEP_DAYS) {
    const oldest = days.shift();
    if (!oldest) break;
    fs.rmSync(path.join(BACKUPS_DIR, oldest), { recursive: true, force: true });
  }
}
