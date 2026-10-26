import { useEffect, useRef, useState } from 'react';
import {
  MAX_TILES_SCALE,
  MIN_TILES_SCALE,
  TILES_PER_ROW,
  TILES_SCALE_STEP,
  useSettings,
} from '../lib/settings';

/** Панель «Вид» на главной: сколько плиток в ряд и какого они размера. */
export function HomeViewSettings() {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Шаг 10%, но с округлением: иначе после «+» появляется 1.0000000000000002.
  const step = (direction: number) => {
    const next = Math.round((settings.tilesScale + direction * TILES_SCALE_STEP) * 10) / 10;
    update({ tilesScale: Math.min(MAX_TILES_SCALE, Math.max(MIN_TILES_SCALE, next)) });
  };

  return (
    <div className="settings" ref={panelRef}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Вид главной"
      >
        Вид
      </button>

      {open ? (
        <div className="settings__panel">
          <div className="settings__row settings__row--stack">
            <span>Плиток в ряд</span>
            <div className="segmented segmented--wide">
              {TILES_PER_ROW.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={settings.tilesPerRow === count ? 'is-active' : ''}
                  onClick={() => update({ tilesPerRow: count })}
                  title={count === 0 ? 'Столько, сколько влезет по ширине окна' : `${count} в ряд`}
                >
                  {count === 0 ? 'Авто' : count}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__row">
            <span>Размер плиток</span>
            <div className="stepper">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={settings.tilesScale <= MIN_TILES_SCALE}
                aria-label="Плитки меньше"
              >
                −
              </button>
              <span>{Math.round(settings.tilesScale * 100)}%</span>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={settings.tilesScale >= MAX_TILES_SCALE}
                aria-label="Плитки больше"
              >
                +
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
