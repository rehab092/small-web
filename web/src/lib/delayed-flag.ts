/**
 * A flag for loading indicators that never flickers.
 *
 *  - it turns on only if the wish to show it lasts `showAfter` ms, so a request
 *    that finishes quickly never flashes a spinner;
 *  - once on, it stays on for at least `minVisible` ms, so it never blinks off
 *    the instant it appeared.
 *
 * Framework-free; the React hook below wraps it.
 */

import { useEffect, useRef, useState } from 'react';

export class DelayedFlag {
  private visible = false;
  private shownAt = 0;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onChange: (visible: boolean) => void,
    private readonly showAfter = 150,
    private readonly minVisible = 350,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Say whether the indicator is wanted right now. Safe to call repeatedly. */
  set(wanted: boolean): void {
    if (wanted) {
      this.clear('hide');
      if (!this.visible && !this.showTimer) {
        this.showTimer = setTimeout(() => {
          this.showTimer = null;
          this.visible = true;
          this.shownAt = this.now();
          this.onChange(true);
        }, this.showAfter);
      }
      return;
    }
    this.clear('show'); // wanted for less than showAfter: never shown at all
    if (this.visible && !this.hideTimer) {
      const left = Math.max(0, this.minVisible - (this.now() - this.shownAt));
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.visible = false;
        this.onChange(false);
      }, left);
    }
  }

  dispose(): void {
    this.clear('show');
    this.clear('hide');
  }

  private clear(which: 'show' | 'hide'): void {
    const timer = which === 'show' ? this.showTimer : this.hideTimer;
    if (timer) clearTimeout(timer);
    if (which === 'show') this.showTimer = null;
    else this.hideTimer = null;
  }
}

/** `wanted`, delayed and held as described on DelayedFlag. */
export function useDelayedFlag(wanted: boolean, showAfter = 150, minVisible = 350): boolean {
  const [visible, setVisible] = useState(false);
  const flag = useRef<DelayedFlag | null>(null);

  useEffect(() => {
    const instance = new DelayedFlag(setVisible, showAfter, minVisible);
    flag.current = instance;
    return () => instance.dispose();
  }, [showAfter, minVisible]);

  useEffect(() => {
    flag.current?.set(wanted);
  }, [wanted]);

  return visible;
}
