import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';
export type SortMode = 'date' | 'title' | 'custom';

export interface Settings {
  theme: Theme;
  fontSize: number;
  rate: number;
  /** Сколько плиток на главной в ряд; 0 — авто по ширине окна. */
  tilesPerRow: number;
  /** Размер плиток на главной: 1 — обычный, 0.7 — мелкие, 1.5 — крупные. */
  tilesScale: number;
  /** Как отсортированы тексты на главной. */
  sort: SortMode;
  /** Порядок текстов для сортировки «Свои»: сначала идут новые, дальше — как подвинул. */
  textsOrder: string[];
}

/** Допустимые скорости озвучки. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 32;

/** Варианты «сколько плиток в ряд»; 0 — авто, 1 — список с маленькой обложкой. */
export const TILES_PER_ROW = [0, 1, 2, 3] as const;

export const MIN_TILES_SCALE = 0.7;
export const MAX_TILES_SCALE = 1.5;
export const TILES_SCALE_STEP = 0.1;

export const SORT_MODES: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: 'date', label: 'Сначала новые' },
  { value: 'title', label: 'А–Я' },
  { value: 'custom', label: 'Свои' },
];

export const DEFAULTS: Settings = {
  theme: 'dark',
  fontSize: 18,
  rate: 0.75,
  tilesPerRow: 0,
  tilesScale: 1,
  sort: 'date',
  textsOrder: [],
};

const STORAGE_KEY = 'project-sus:settings';
/** Версия настроек: при смене эталона шрифта старые значения сбрасываются. */
const SETTINGS_VERSION = 2;

function clampFontSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isFinite(size)) return DEFAULTS.fontSize;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Старое значение (например, 0,85) приводим к ближайшей допустимой скорости. */
function nearestSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.rate;
  return SPEEDS.reduce<number>(
    (best, speed) => (Math.abs(speed - value) < Math.abs(best - value) ? speed : best),
    DEFAULTS.rate,
  );
}

function clampTilesScale(value: unknown): number {
  const scale = Number(value);
  if (!Number.isFinite(scale)) return DEFAULTS.tilesScale;
  const clamped = Math.min(MAX_TILES_SCALE, Math.max(MIN_TILES_SCALE, scale));
  // Округление, чтобы после «+» не появлялось 1.0000000000000002.
  return Math.round(clamped * 10) / 10;
}

function normalizeTilesPerRow(value: unknown): number {
  const variant = value as (typeof TILES_PER_ROW)[number];
  return TILES_PER_ROW.includes(variant) ? variant : DEFAULTS.tilesPerRow;
}

function normalizeSort(value: unknown): SortMode {
  return SORT_MODES.some((mode) => mode.value === value) ? (value as SortMode) : DEFAULTS.sort;
}

function normalizeOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULTS.textsOrder;
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function readSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULTS;
    const parsed = JSON.parse(stored) as Partial<Settings> & { v?: number };
    // Старые настройки (без версии) могли хранить шрифт, отличный от эталонных 18.
    const fontSize = parsed.v === SETTINGS_VERSION ? clampFontSize(parsed.fontSize) : DEFAULTS.fontSize;
    return {
      ...DEFAULTS,
      ...parsed,
      fontSize,
      rate: nearestSpeed(typeof parsed.rate === 'number' ? parsed.rate : DEFAULTS.rate),
      tilesPerRow: normalizeTilesPerRow(parsed.tilesPerRow),
      tilesScale: clampTilesScale(parsed.tilesScale),
      sort: normalizeSort(parsed.sort),
      textsOrder: normalizeOrder(parsed.textsOrder),
    };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, v: SETTINGS_VERSION }));
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => setSettings((current) => ({ ...current, ...patch })),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings используется вне SettingsProvider');
  return context;
}
