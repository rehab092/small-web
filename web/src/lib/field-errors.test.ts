import { describe, expect, it } from 'vitest';
import { friendlyFieldError } from './field-errors';

describe('friendlyFieldError', () => {
  it('explains the empty-after-sanitizing 400 and says what to do', () => {
    const out = friendlyFieldError('html', 'nothing left to show after removing disallowed content');
    expect(out).toMatch(/Add some text/);
    expect(out).toMatch(/scripts, forms, images/);
  });

  it('only rewrites it for the html field', () => {
    expect(friendlyFieldError('title', 'nothing left to show after removing disallowed content')).toBe(
      'nothing left to show after removing disallowed content',
    );
  });

  it('passes every other message through untouched', () => {
    expect(friendlyFieldError('address', 'address must be a name ending in .zz')).toBe(
      'address must be a name ending in .zz',
    );
  });
});
