'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ADDRESS_BAR_ID, allowedHere, shortcutFor, type ShortcutAction } from './shortcuts';

interface Options {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

/**
 * Wires the keyboard shortcuts (see shortcuts.ts) to the browser. Returns `run`,
 * so shortcuts pressed inside a sandboxed page, which arrive as bridge messages,
 * do exactly what the same keys do outside it.
 */
export function useShortcuts(options: Options): (action: ShortcutAction) => void {
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback((action: ShortcutAction) => {
    const o = latest.current;
    if (action === 'back') {
      if (o.canBack) o.onBack();
    } else if (action === 'forward') {
      if (o.canForward) o.onForward();
    } else {
      const bar = document.getElementById(ADDRESS_BAR_ID) as HTMLInputElement | null;
      bar?.focus();
      bar?.select();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcutFor(event);
      if (!action || !allowedHere(action, event.target as HTMLElement | null)) return;
      event.preventDefault(); // also stops the browser's own Alt+Left / Ctrl+L
      run(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run]);

  return run;
}
