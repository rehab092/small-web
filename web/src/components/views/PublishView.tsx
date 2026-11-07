'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type PreviewDto } from '@/lib/api';
import { normalizeAddress } from '@/lib/address';
import { friendlyFieldError } from '@/lib/field-errors';
import { useScrollMemory } from '@/lib/use-scroll-memory';
import type { PersonDto, SiteDto } from '@/lib/types';
import type { ViewCache } from '@/lib/use-browser';
import { SiteFrame } from '../SiteFrame';

interface Props {
  entryId: string;
  people: PersonDto[];
  person: string;
  /** Address to start the form with (e.g. from a Nowhere page). */
  prefill: string | null;
  scroll: number;
  cache: ViewCache;
  /** Visit a page that was just published. */
  onVisit: (address: string) => void;
  saveScroll: (y: number) => void;
}

interface Draft {
  address: string;
  title: string;
  html: string;
  authorId: string;
}

const MAX_HTML = 100_000;
const MAX_TITLE = 120;
const PREVIEW_DELAY_MS = 350;
/** Used only if the server ever answers empty without wording; its own message wins. */
const EMPTY_FALLBACK = 'nothing left to show after removing disallowed content';

const STARTER = `<h1>Salt marsh notes</h1>
<p>Low tide at the marsh edge, and the channels fill with light.
Read about the <a href="tidepool.zz">tidepool</a> next door.</p>
<style>h1{color:#1f5fbf}</style>`;

/**
 * The publish form. The preview is what the server would store: it sanitizes the
 * typed HTML (POST /sites/preview) and the result runs in the same sandboxed frame
 * every other page uses, so what is previewed is what is published. The draft is kept per
 * history entry, so Back/Forward never lose a half-written page.
 */
export function PublishView({ entryId, people, person, prefill, scroll, cache, onVisit, saveScroll }: Props) {
  const key = `publish:${entryId}`;
  const authors = useMemo(() => people.filter((p) => p.roles.includes('author')), [people]);
  const [draft, setDraft] = useState<Draft>(
    () =>
      (cache.get(key) as Draft | undefined) ?? {
        address: prefill ?? '',
        title: '',
        html: '',
        authorId: authors.find((a) => a.id === person)?.id ?? authors[0]?.id ?? '',
      },
  );
  // What the server says publishing `previewFor` would store (see the preview effect below).
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [published, setPublished] = useState<{ site: SiteDto; replaced: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useScrollMemory(scroller, scroll, saveScroll, true);

  useEffect(() => {
    cache.set(key, draft);
  }, [cache, key, draft]);

  // The preview is the server's own sanitizing of what was typed (POST /sites/preview), so
  // it is exactly what publishing would store. Debounced because it is real work, and a
  // newer keystroke abandons the request in flight.
  useEffect(() => {
    const html = draft.html;
    if (html.trim() === '') {
      setPreview(null);
      setPreviewFor(null);
      setPreviewStatus('idle');
      return;
    }
    if (html.length > MAX_HTML) {
      setPreviewStatus('idle'); // the character counter already says it is too long
      return;
    }
    const ctrl = new AbortController();
    setPreviewStatus('loading');
    const timer = setTimeout(() => {
      api
        .preview(html, ctrl.signal)
        .then((result) => {
          setPreview(result);
          setPreviewFor(html);
          setPreviewStatus('idle');
        })
        .catch((err: unknown) => {
          if ((err as Error).name === 'AbortError') return;
          setPreviewStatus('error');
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [draft.html]);

  // The server's verdict on the html as it stands now. This is the ONE definition of
  // "nothing readable is left": the client never decides it, it only shows it.
  const previewIsCurrent = previewFor === draft.html;
  const serverSaysEmpty = previewIsCurrent && preview?.empty === true;

  const normalized = normalizeAddress(draft.address);
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setPublished(null);
    // A conflict is about the address: keep offering "Replace" while the rest of
    // the page is being edited, and clear it only when the address changes.
    if ('address' in patch) {
      setConflict(false);
      setMessage(null);
    }
    setFields((current) => {
      const next = { ...current };
      for (const name of Object.keys(patch)) delete next[name];
      return next;
    });
  };

  const clientErrors: Record<string, string> = {};
  if (draft.address.trim() && !normalized) clientErrors.address = 'Use a name ending in .zz, like tidepool.zz';
  if (draft.title.length > MAX_TITLE) clientErrors.title = `Keep the title under ${MAX_TITLE} characters`;
  if (draft.html.length > MAX_HTML) clientErrors.html = `Pages are limited to ${MAX_HTML.toLocaleString()} characters`;
  const complete = Boolean(normalized && draft.title.trim() && draft.html.trim() && draft.authorId);
  const valid = complete && Object.keys(clientErrors).length === 0 && !serverSaysEmpty;

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      setFields(err.fields ?? {});
      setMessage(err.fields ? null : err.message);
      setConflict(err.status === 409);
      if (err.status === 409) setMessage('That address is already published.');
    } else {
      setMessage('Something went wrong. Please try again.');
    }
  };

  const submit = async (replace: boolean) => {
    if (!valid || !normalized || submitting) return;
    setSubmitting(true);
    setFields({});
    setMessage(null);
    setConflict(false);
    try {
      const body = { title: draft.title.trim(), html: draft.html, authorId: draft.authorId };
      const site = replace
        ? await api.replace(normalized, body)
        : await api.publish({ address: normalized, ...body });
      setPublished({ site, replaced: replace });
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (name: string) => {
    const fromApi = fields[name]?.[0];
    if (fromApi) return friendlyFieldError(name, fromApi);
    if (name === 'html' && serverSaysEmpty) {
      return friendlyFieldError('html', preview?.message ?? EMPTY_FALLBACK);
    }
    return clientErrors[name];
  };

  if (authors.length === 0) {
    return (
      <div className="page-scroll" ref={scroller}>
        <div className="page">
          <h1>Publish a site</h1>
          <p className="muted">There are no authors to publish as yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll" ref={scroller}>
      <div className="page publish">
        <p className="eyebrow">Publish</p>
        <h1 tabIndex={-1}>Put a page on the Small Web</h1>

        <div className="publish__grid">
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
            noValidate
          >
            <label className="field">
              <span className="field__label">Address</span>
              <input
                value={draft.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="tidepool.zz"
                className="mono"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={Boolean(fieldError('address'))}
              />
              {normalized && normalized !== draft.address.trim() && (
                <span className="field__hint">Will be published at {normalized}</span>
              )}
              {fieldError('address') && <span className="field-error">{fieldError('address')}</span>}
            </label>

            <label className="field">
              <span className="field__label">Title</span>
              <input
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="What the page is called"
                aria-invalid={Boolean(fieldError('title'))}
              />
              {fieldError('title') && <span className="field-error">{fieldError('title')}</span>}
            </label>

            <label className="field">
              <span className="field__label">Author</span>
              <select value={draft.authorId} onChange={(e) => set({ authorId: e.target.value })}>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {!authors.some((a) => a.id === person) && (
                <span className="field__hint" data-testid="author-hint">
                  {people.find((p) => p.id === person)?.name ?? 'This person'} can browse but is not an
                  author, so pages are published under one of the authors.
                </span>
              )}
              {fieldError('authorId') && <span className="field-error">{fieldError('authorId')}</span>}
            </label>

            <label className="field">
              <span className="field__label">
                HTML
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => set({ html: STARTER, title: draft.title || 'Salt marsh notes' })}
                >
                  Insert a starter page
                </button>
              </span>
              <textarea
                value={draft.html}
                onChange={(e) => set({ html: e.target.value })}
                rows={14}
                className="mono"
                spellCheck={false}
                placeholder="<h1>Hello</h1><p>Write the page itself here. Links to other addresses work.</p>"
                aria-invalid={Boolean(fieldError('html'))}
              />
              <span className={draft.html.length > MAX_HTML ? 'field__hint field__hint--bad' : 'field__hint'}>
                {draft.html.length.toLocaleString()} / {MAX_HTML.toLocaleString()} characters. Plain HTML
                and inline styles only: scripts, forms, images and external files are removed.
              </span>
              {fieldError('html') && <span className="field-error">{fieldError('html')}</span>}
            </label>

            {message && (
              <p className="field-error" role="alert">
                {message}
              </p>
            )}
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={!valid || submitting}>
                {submitting ? 'Publishing…' : 'Publish'}
              </button>
              {conflict && (
                <button
                  type="button"
                  className="btn"
                  disabled={!valid || submitting}
                  onClick={() => void submit(true)}
                  title="Replace the page at this address with this one"
                >
                  Replace the existing page
                </button>
              )}
            </div>
          </form>

          <section className="preview" aria-label="Preview">
            <h2 className="section-title">Preview</h2>
            <div
              className={previewStatus === 'loading' ? 'preview__frame preview__frame--updating' : 'preview__frame'}
              aria-busy={previewStatus === 'loading'}
            >
              {!draft.html.trim() ? (
                <p className="muted pad">Start typing HTML to see it here.</p>
              ) : serverSaysEmpty ? (
                <p className="field-error pad" role="status">
                  {friendlyFieldError('html', preview?.message ?? EMPTY_FALLBACK)}
                </p>
              ) : preview && !preview.empty ? (
                <SiteFrame html={preview.html} title={draft.title || 'Preview'} label="Page preview" />
              ) : previewStatus === 'error' ? (
                <p className="muted pad">The preview could not be loaded. Is the server running?</p>
              ) : (
                <p className="muted pad">Preparing the preview…</p>
              )}
              {previewStatus === 'loading' && preview && (
                <span className="preview__badge" aria-hidden="true">
                  Updating…
                </span>
              )}
            </div>
            <p className="field__hint">
              Shown exactly as it will be published: the server first removes scripts, forms, images and
              external files, then the page runs in the same sandbox as every other. Links do nothing here.
            </p>
          </section>
        </div>

        {published && (
          <section className="published" aria-live="polite">
            <h2 className="section-title">
              {published.replaced ? 'Replaced' : 'Published'} at{' '}
              <span className="mono">{published.site.address}</span>
            </h2>
            <p className="muted">
              This is the page as the server stored it, after sanitizing.
            </p>
            <div className="preview__frame preview__frame--short">
              <SiteFrame html={published.site.html} title={published.site.title} label="Published page" />
            </div>
            <button type="button" className="btn btn--primary" onClick={() => onVisit(published.site.address)}>
              Visit {published.site.address}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
