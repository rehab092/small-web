'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  IFRAME_SANDBOX,
  buildSrcDoc,
  parseBridgeMessage,
  randomToken,
} from '@/lib/containment';
import type { ShortcutAction } from '@/lib/shortcuts';

interface Props {
  /** The (server-sanitized) author markup. Treated as hostile regardless. */
  html: string;
  title: string;
  /** Scroll offset to restore once the page is laid out. */
  restoreY?: number;
  /** A link was clicked inside the page. */
  onLink?: (href: string) => void;
  /** The page was scrolled to `y`. */
  onScroll?: (y: number) => void;
  /** A browser shortcut was pressed while focus was inside the page. */
  onKey?: (action: ShortcutAction) => void;
  /** Label for assistive tech. */
  label?: string;
}

/**
 * Renders one page of someone else's HTML. All of the trust decisions live in
 * lib/containment.ts; this component only wires the iframe to them:
 *  - fresh frame id + nonce for every document (a stale page cannot talk to us);
 *  - messages are accepted only from this iframe's window, from the opaque
 *    origin a sandboxed frame has, and only in the exact shape we define.
 */
export function SiteFrame({ html, title, restoreY = 0, onLink, onScroll, onKey, label }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handlers = useRef({ onLink, onScroll, onKey });
  handlers.current = { onLink, onScroll, onKey };

  const doc = useMemo(() => {
    const frame = randomToken();
    const nonce = randomToken();
    const srcDoc = buildSrcDoc(html, {
      frame,
      nonce,
      parentOrigin: window.location.origin,
      restoreY,
      title,
    });
    return { frame, srcDoc };
    // restoreY is read once per document: scroll saves must not rebuild the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, title]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== 'null') return; // sandboxed, no allow-same-origin
      const msg = parseBridgeMessage(event.data, doc.frame);
      if (!msg) return;
      if (msg.type === 'link') handlers.current.onLink?.(msg.href);
      else if (msg.type === 'scroll') handlers.current.onScroll?.(msg.y);
      else if (msg.type === 'key') handlers.current.onKey?.(msg.action);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [doc.frame]);

  return (
    <iframe
      key={doc.frame}
      ref={iframeRef}
      className="site-frame"
      title={label ?? title}
      sandbox={IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={doc.srcDoc}
    />
  );
}
