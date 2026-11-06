/**
 * Wording for validation messages from the API, so the publish form says what to
 * do instead of repeating a server phrase. Unknown messages pass through as they
 * are.
 */
export function friendlyFieldError(field: string, message: string): string {
  if (field === 'html' && /nothing left to show/i.test(message)) {
    return 'Nothing readable is left once scripts, forms, images and other disallowed content are removed. Add some text or headings.';
  }
  return message;
}
