/**
 * CSS Custom Highlight API: подсветка диапазонов текста без обёрток в DOM.
 * Поддерживается в Chrome/Edge 105+, поэтому есть мягкий фолбэк.
 */

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

function registry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return null;
  return (CSS as unknown as { highlights: HighlightRegistry }).highlights;
}

export function supportsHighlights(): boolean {
  return (
    registry() !== null &&
    typeof (globalThis as unknown as { Highlight?: unknown }).Highlight === 'function'
  );
}

export function setHighlight(name: string, ranges: Range[]): void {
  const highlights = registry();
  const HighlightCtor = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;
  if (!highlights || !HighlightCtor) return;
  highlights.set(name, new HighlightCtor(...ranges));
}

export function clearHighlight(name: string): void {
  registry()?.delete(name);
}
