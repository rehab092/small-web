import { describe, expect, it } from 'vitest';
import { ADDRESS_BAR_ID, allowedHere, isEditable, shortcutFor, type KeyLike } from './shortcuts';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('shortcutFor', () => {
  it('maps Alt+Left and Alt+Right to back and forward', () => {
    expect(shortcutFor(key('ArrowLeft', { altKey: true }))).toBe('back');
    expect(shortcutFor(key('ArrowRight', { altKey: true }))).toBe('forward');
  });

  it('maps Ctrl+L and Cmd+L to the address bar, in either case', () => {
    expect(shortcutFor(key('l', { ctrlKey: true }))).toBe('address');
    expect(shortcutFor(key('L', { ctrlKey: true }))).toBe('address');
    expect(shortcutFor(key('l', { metaKey: true }))).toBe('address');
  });

  it('ignores plain arrows, other letters and extra modifiers', () => {
    expect(shortcutFor(key('ArrowLeft'))).toBeNull();
    expect(shortcutFor(key('ArrowLeft', { altKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFor(key('ArrowLeft', { altKey: true, ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('k', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('l'))).toBeNull();
    expect(shortcutFor(key('l', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutFor(key('ArrowUp', { altKey: true }))).toBeNull();
  });
});

describe('allowedHere', () => {
  const input = { tagName: 'INPUT' };
  const bar = { tagName: 'INPUT', id: ADDRESS_BAR_ID };

  it('treats inputs, textareas, selects and contenteditable as editable', () => {
    expect(isEditable(input)).toBe(true);
    expect(isEditable({ tagName: 'textarea' })).toBe(true);
    expect(isEditable({ tagName: 'SELECT' })).toBe(true);
    expect(isEditable({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditable({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditable(null)).toBe(false);
  });

  it('back and forward do not fire while typing in a field', () => {
    expect(allowedHere('back', input)).toBe(false);
    expect(allowedHere('forward', { tagName: 'TEXTAREA' })).toBe(false);
  });

  it('back and forward do fire elsewhere and from the address bar', () => {
    expect(allowedHere('back', { tagName: 'BODY' })).toBe(true);
    expect(allowedHere('back', { tagName: 'BUTTON' })).toBe(true);
    expect(allowedHere('forward', bar)).toBe(true);
  });

  it('focusing the address bar works from anywhere, even from another field', () => {
    expect(allowedHere('address', input)).toBe(true);
    expect(allowedHere('address', null)).toBe(true);
  });
});
