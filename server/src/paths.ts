import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Корень проекта: .../server/src -> ... */
export const ROOT = path.resolve(here, '..', '..');
export const TEXTS_DIR = path.join(ROOT, 'texts');
export const DATA_DIR = path.join(ROOT, 'server', 'data');
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
