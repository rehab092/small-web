'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Restore-on-return for the built-in pages: scrolls the container back to where
 * the entry was left once its content is `ready`, and reports further scrolling
 * (throttled to one report per frame) so the stack can remember it.
 */
export function useScrollMemory(
  ref: RefObject<HTMLElement | null>,
  initial: number,
  save: (y: number) => void,
  ready: boolean,
): void {
  const saveRef = useRef(save);
  saveRef.current = save;
  const restored = useRef(false);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const el = ref.current;
    if (el && initial > 0) el.scrollTop = initial;
  }, [ready, initial, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Do not overwrite the remembered position with 0 before it was restored.
        if (restored.current) saveRef.current(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
