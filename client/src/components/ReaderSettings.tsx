import { useEffect, useRef, useState } from 'react';
import { SPEEDS, MAX_FONT_SIZE, MIN_FONT_SIZE, useSettings } from '../lib/settings';

export function ReaderSettings() {
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

  return (
    <div className="settings" ref={panelRef}>
      <button
        type="button"
        className="icon-btn icon-btn--text"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Настройки чтения"
        title="Настройки чтения"
      >
        Aa
      </button>

      {open ? (
        <div className="settings__panel">
          <div className="settings__row">
            <span>Размер шрифта</span>
            <div className="stepper">
              <button
                type="button"
                onClick={() => update({ fontSize: Math.max(MIN_FONT_SIZE, settings.fontSize - 1) })}
                aria-label="Меньше шрифт"
              >
                −
              </button>
              <span>{settings.fontSize}</span>
              <button
                type="button"
                onClick={() => update({ fontSize: Math.min(MAX_FONT_SIZE, settings.fontSize + 1) })}
                aria-label="Больше шрифт"
              >
                +
              </button>
            </div>
          </div>

          <div className="settings__row settings__row--stack">
            <span>Скорость озвучки</span>
            <div className="segmented segmented--wide">
              {SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={settings.rate === speed ? 'is-active' : ''}
                  onClick={() => update({ rate: speed })}
                >
                  {String(speed).replace('.', ',')}×
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
