/**
 * Keyboard shortcuts of the browser, as pure functions so they are easy to test.
 *
 *  - Alt+Left / Alt+Right  back / forward
 *  - Ctrl+L or Cmd+L       focus the address bar
 *
 * They must not fire while someone is typing in a field (Alt+Left would fight
 * the text caret), except the address-bar ones: Ctrl/Cmd+L always works, and
 * back/forward also work from the address bar itself, as in any browser.
 */

export type ShortcutAction = 'back' | 'forward' | 'address';

export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** What the key press means, or null when it is not one of ours. */
export function shortcutFor(event: KeyLike): ShortcutAction | null {
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.key === 'ArrowLeft') return 'back';
    if (event.key === 'ArrowRight') return 'forward';
    return null;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'l') {
    return 'address';
  }
  return null;
}

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  id?: string;
}

/** Is this element somewhere text is typed? */
export function isEditable(target: TargetLike | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export const ADDRESS_BAR_ID = 'address-bar';

/** Should `action` run for a key press that happened on `target`? */
export function allowedHere(action: ShortcutAction, target: TargetLike | null): boolean {
  if (action === 'address') return true;
  if (!isEditable(target)) return true;
  return target?.id === ADDRESS_BAR_ID;
}
