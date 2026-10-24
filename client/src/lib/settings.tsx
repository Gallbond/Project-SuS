import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

export interface Settings {
  theme: Theme;
  fontSize: number;
  rate: number;
}

/** Допустимые скорости озвучки. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 32;

export const DEFAULTS: Settings = {
  theme: 'dark',
  fontSize: 18,
  rate: 0.75,
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
