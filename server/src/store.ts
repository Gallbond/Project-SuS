import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths';

/**
 * Крошечное JSON-хранилище «ключ → значение».
 * Данные держим в памяти, на диск пишем при каждом изменении (атомарно).
 * Для личного приложения с парой тысяч записей этого более чем достаточно.
 */
export class JsonStore<V> {
  private data: Record<string, V> | null = null;

  constructor(private readonly fileName: string) {}

  private get filePath(): string {
    return path.join(DATA_DIR, this.fileName);
  }

  private load(): Record<string, V> {
    if (this.data !== null) return this.data;
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, V>;
    } catch {
      this.data = {};
    }
    return this.data;
  }

  get size(): number {
    return Object.keys(this.load()).length;
  }

  get(key: string): V | undefined {
    return this.load()[key];
  }

  all(): Record<string, V> {
    return this.load();
  }

  set(key: string, value: V): void {
    this.load()[key] = value;
    this.flush();
  }

  delete(key: string): boolean {
    const data = this.load();
    if (!(key in data)) return false;
    delete data[key];
    this.flush();
    return true;
  }

  private flush(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}
